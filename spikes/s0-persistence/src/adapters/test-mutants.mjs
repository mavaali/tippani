// Deliberately broken DURABLE stores, used only to prove that the durable
// scenarios (cross-process race, kill-during-commit, restart) can actually
// fail a bad implementation. They are registered only when
// S0_ENABLE_TEST_MUTANTS=1 so a normal run cannot select them.

import fs from "node:fs";
import { LocalCasWorkspaceStore } from "./local-cas-store.mjs";
import {
  WorkspaceConflictError,
  applyWorkspaceOperation,
  deepClone,
} from "../workspace-contract.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** No lock: two processes read the same generation and both write. */
export class UnlockedCasStore extends LocalCasWorkspaceStore {
  async compareAndSwap({ workspaceId, expectedGeneration, operation, faultInjector = null }) {
    this.ensureInitialized();
    const current = this.readEnvelope(workspaceId);
    if (current.generation !== expectedGeneration) {
      throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
    }
    // Widen the read-modify-write window so the lost update is deterministic
    // rather than dependent on scheduling luck.
    await sleep(120);
    const next = applyWorkspaceOperation(current, operation);
    faultInjector?.hit("before-commit");
    this.writeEnvelope(next);
    faultInjector?.hit("after-commit");
    return deepClone(next);
  }
}

/** Writes in place instead of temp+fsync+rename, so a kill tears the file. */
export class TornWriteCasStore extends LocalCasWorkspaceStore {
  async compareAndSwap({ workspaceId, expectedGeneration, operation, faultInjector = null }) {
    this.ensureInitialized();
    const current = this.readEnvelope(workspaceId);
    if (current.generation !== expectedGeneration) {
      throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
    }
    const next = applyWorkspaceOperation(current, operation);
    const file = this.envelopePath(workspaceId);
    const payload = JSON.stringify({ schemaVersion: 1, checksum: "unchecked", workspace: next });
    fs.writeFileSync(file, payload.slice(0, Math.floor(payload.length / 2)));
    faultInjector?.hit("before-commit");
    fs.writeFileSync(file, payload);
    faultInjector?.hit("after-commit");
    return deepClone(next);
  }
}

/** Acknowledges a commit it never persists. */
export class VolatileCommitCasStore extends LocalCasWorkspaceStore {
  async compareAndSwap({ workspaceId, expectedGeneration, operation }) {
    this.ensureInitialized();
    const current = this.readEnvelope(workspaceId);
    if (current.generation !== expectedGeneration) {
      throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
    }
    return applyWorkspaceOperation(current, operation);
  }
}

export const TEST_MUTANT_FACTORIES = Object.freeze({
  "mutant-cas-unlocked": (options) => new UnlockedCasStore(options),
  "mutant-cas-torn-write": (options) => new TornWriteCasStore(options),
  "mutant-cas-volatile": (options) => new VolatileCommitCasStore(options),
});
