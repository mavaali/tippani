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

function collect(child) {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  return {
    exit: new Promise((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    }),
    read: () => ({ stdout, stderr, report: parseReport(stdout) }),
  };
}

export async function runWorker(args, { timeoutMs = 30_000 } = {}) {
  const child = fork(WORKER, args, { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const streams = collect(child);
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  try {
    const { code, signal } = await streams.exit;
    return { code, signal, ...streams.read() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Start every writer, wait until each is loaded and blocked at the barrier,
 * then release them together so they contend for the same generation.
 */
export async function raceWorkers(argsList, { timeoutMs = 30_000 } = {}) {
  const children = argsList.map((args) => {
    const child = fork(WORKER, args, { stdio: ["ignore", "pipe", "pipe", "ipc"] });
    return { child, streams: collect(child) };
  });
  const timer = setTimeout(() => {
    for (const { child } of children) child.kill("SIGKILL");
  }, timeoutMs);
  try {
    await Promise.all(children.map(({ child }) => new Promise((resolve, reject) => {
      child.on("message", (message) => { if (message?.ready) resolve(); });
      child.on("exit", () => reject(new Error("Worker exited before reaching the barrier")));
    })));
    for (const { child } of children) child.send("go");
    return await Promise.all(children.map(async ({ streams }) => {
      const { code, signal } = await streams.exit;
      return { code, signal, ...streams.read() };
    }));
  } finally {
    clearTimeout(timer);
  }
}
