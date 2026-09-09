import { PersistentPendingQueue } from "../adapters/persistent-pending-queue.mjs";

function argOf(name, fallback = null) {
  const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return prefixed ? prefixed.slice(name.length + 3) : fallback;
}

async function waitForRelease() {
  if (!process.send || argOf("barrier", "false") !== "true") return;
  process.send({ ready: true });
  await new Promise((resolve) => {
    process.on("message", (message) => {
      if (message === "go") resolve();
    });
  });
}

const queue = new PersistentPendingQueue({
  storeRoot: argOf("root"),
  provider: argOf("provider"),
  runId: argOf("run-id"),
});
const mode = argOf("mode", "list");

if (mode === "append") {
  await waitForRelease();
  const request = JSON.parse(Buffer.from(argOf("request"), "base64url").toString("utf8"));
  await queue.append(request);
}

const output = `${JSON.stringify({
  pid: process.pid,
  count: await queue.count(),
  entries: await queue.list(),
})}\n`;
await new Promise((resolve) => process.stdout.write(output, resolve));
process.disconnect?.();
