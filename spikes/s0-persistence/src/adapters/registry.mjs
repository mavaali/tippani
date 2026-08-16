import { ReferenceMemoryWorkspaceStore } from "./reference-memory-store.mjs";
import { LocalCasWorkspaceStore } from "./local-cas-store.mjs";
import { LocalSqliteWorkspaceStore } from "./local-sqlite-store.mjs";

/**
 * Adapters that keep authoritative state on disk. Only these can supply
 * evidence for restart, cross-process, and atomic-replace scenarios.
 */
export const DURABLE_ADAPTERS = new Set([
  "local-cas",
  "local-sqlite",
  "mutant-cas-unlocked",
  "mutant-cas-torn-write",
  "mutant-cas-volatile",
]);

const FACTORIES = {
  "reference-memory": (options) => new ReferenceMemoryWorkspaceStore(options),
  "local-cas": (options) => new LocalCasWorkspaceStore(options),
  "local-sqlite": (options) => new LocalSqliteWorkspaceStore(options),
};

// Broken stores exist only to prove the durable scenarios have detection
// power. They are unavailable unless a test explicitly opts in, so no reported
// S0 result can be produced by one.
if (process.env.S0_ENABLE_TEST_MUTANTS === "1") {
  const { TEST_MUTANT_FACTORIES } = await import("./test-mutants.mjs");
  Object.assign(FACTORIES, TEST_MUTANT_FACTORIES);
}

export function createStore(adapter, options = {}) {
  const factory = FACTORIES[adapter];
  if (!factory) throw new Error(`Unknown S0 adapter: ${adapter}`);
  return factory(options);
}

export function isDurable(adapter) {
  return DURABLE_ADAPTERS.has(adapter);
}
