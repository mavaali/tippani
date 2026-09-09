// Spawns store workers as real OS processes and releases them simultaneously,
// so concurrency evidence does not depend on one event loop interleaving.

import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const WORKER = fileURLToPath(new URL("./workers/store-worker.mjs", import.meta.url));

function parseReport(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      return JSON.parse(lines[index]);
    } catch { /* not the report line */ }
  }
  return null;
}

function attachBudgetBroker(child, budget) {
  if (!budget) return;
  child.on("message", async (message) => {
    if (message?.type !== "s0-budget-request") return;
    try {
      const snapshot = await budget.consume(message.delta || {});
      child.send({ type: "s0-budget-response", id: message.id, ok: true, snapshot });
    } catch (error) {
      child.send({
        type: "s0-budget-response",
        id: message.id,
        ok: false,
        error: {
          message: error?.message,
          kind: error?.kind,
          limit: error?.limit,
          actual: error?.actual,
        },
      });
    }
  });
}

function collect(child, budget = null, args = []) {
  attachBudgetBroker(child, budget);
  let stdout = "";
  let stderr = "";
  let signalBooted;
  let signalReady;
  const bootedSignal = new Promise((resolve) => { signalBooted = resolve; });
  const readySignal = new Promise((resolve) => { signalReady = resolve; });
  child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("message", (message) => {
    if (message?.booted) signalBooted(message);
    if (message?.ready) signalReady(message);
  });
  const exit = new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once("error", (error) => finish({ code: null, signal: null, error }));
    child.once("close", (code, signal) => finish({ code, signal, error: null }));
  });
  const read = () => ({ stdout, stderr, report: parseReport(stdout) });
  return {
    args,
    exit,
    booted: Promise.race([
      bootedSignal.then((message) => ({ ready: true, message })),
      exit.then((result) => ({ ready: false, result })),
    ]),
    ready: Promise.race([
      readySignal.then((message) => ({ ready: true, message })),
      exit.then((result) => ({ ready: false, result })),
    ]),
    read,
  };
}

function barrierFailure(child, streams, result) {
  const output = streams.read();
  const exit = result.error
    ? `spawn error=${result.error.message}`
    : `exit code=${result.code}, signal=${result.signal || "none"}`;
  const report = output.report ? `, report=${JSON.stringify(output.report)}` : "";
  const stderr = output.stderr.trim() ? `, stderr=${JSON.stringify(output.stderr.trim())}` : "";
  const error = new Error(
    `Worker exited before reaching the barrier: pid=${child.pid}, ${exit}${report}${stderr}`,
  );
  error.code = "worker_barrier_failed";
  error.worker = {
    pid: child.pid,
    args: streams.args,
    ...result,
    ...output,
  };
  return error;
}

export async function runWorker(args, { timeoutMs = 30_000, budget = null } = {}) {
  const child = fork(WORKER, args, { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const streams = collect(child, budget, args);
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  try {
    const { code, signal, error } = await streams.exit;
    return { code, signal, error, ...streams.read() };
  } finally {
    clearTimeout(timer);
  }
}

function send(child, message) {
  return new Promise((resolve, reject) => {
    child.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function adapterOf(args) {
  const option = args.find((arg) => arg.startsWith("--adapter="));
  return option?.slice("--adapter=".length) || "";
}

/**
 * Start every writer, wait until each is loaded and blocked at the barrier,
 * then release them together so they contend for the same generation.
 */
export async function raceWorkers(argsList, { timeoutMs = 30_000, budget = null } = {}) {
  const children = argsList.map((args) => {
    const workerArgs = [...args, "--defer-initialize=true"];
    const child = fork(WORKER, workerArgs, { stdio: ["ignore", "pipe", "pipe", "ipc"] });
    return { child, streams: collect(child, budget, workerArgs) };
  });
  let timer;
  let completed = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      for (const { child } of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
      const error = new Error(`Timed out waiting for worker barrier or exit after ${timeoutMs}ms`);
      error.code = "worker_timeout";
      reject(error);
    }, timeoutMs);
  });
  try {
    await Promise.race([
      Promise.all(children.map(async ({ child, streams }) => {
        const state = await streams.booted;
        if (!state.ready) throw barrierFailure(child, streams, state.result);
      })),
      timeout,
    ]);
    const serialInitialization = children.every(({ streams }) => {
      const adapter = adapterOf(streams.args);
      return adapter.startsWith("local-") || adapter.startsWith("mutant-cas-");
    });
    // Local schema/WAL bootstrap is not part of the mutation race. Initialize
    // those clients one at a time, then release every ready writer together.
    if (serialInitialization) {
      for (const { child, streams } of children) {
        await send(child, "init");
        const state = await Promise.race([streams.ready, timeout]);
        if (!state.ready) throw barrierFailure(child, streams, state.result);
      }
    } else {
      await Promise.all(children.map(({ child }) => send(child, "init")));
      await Promise.race([
        Promise.all(children.map(async ({ child, streams }) => {
          const state = await streams.ready;
          if (!state.ready) throw barrierFailure(child, streams, state.result);
        })),
        timeout,
      ]);
    }
    await Promise.all(children.map(({ child }) => send(child, "go")));
    const results = await Promise.race([
      Promise.all(children.map(async ({ streams }) => {
        const { code, signal, error } = await streams.exit;
        return { code, signal, error, ...streams.read() };
      })),
      timeout,
    ]);
    completed = true;
    return results;
  } finally {
    clearTimeout(timer);
    if (!completed) {
      for (const { child } of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
      await Promise.allSettled(children.map(({ streams }) => streams.exit));
    }
  }
}
