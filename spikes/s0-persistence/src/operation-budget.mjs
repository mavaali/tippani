import { performance } from "node:perf_hooks";
import { WorkspaceStoreError } from "./workspace-contract.mjs";

export class SafetyBudgetError extends WorkspaceStoreError {
  constructor(kind, limit, actual) {
    super(`Safety budget exceeded for ${kind}: limit ${limit}, attempted ${actual}`, "safety_budget_exceeded");
    this.kind = kind;
    this.limit = limit;
    this.actual = actual;
  }
}

export function valueBytes(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string" || Buffer.isBuffer(value)) return Buffer.byteLength(value);
  return Buffer.byteLength(JSON.stringify(value));
}

export class OperationBudget {
  constructor({ limits, signal = null, deadlineAt = null, clock = () => performance.now() } = {}) {
    this.limits = { ...(limits || {}) };
    this.signal = signal;
    this.clock = clock;
    this.deadlineAt = deadlineAt ?? (
      Number.isFinite(this.limits.maxDurationMs)
        ? this.clock() + this.limits.maxDurationMs
        : Number.POSITIVE_INFINITY
    );
    this.operations = 0;
    this.objects = 0;
    this.bytes = 0;
  }

  assertActive() {
    if (this.signal?.aborted) {
      throw new SafetyBudgetError("deadline", this.limits.maxDurationMs, "aborted");
    }
    if (this.clock() > this.deadlineAt) {
      throw new SafetyBudgetError("deadline", this.limits.maxDurationMs, "expired");
    }
  }

  consume({
    operations = 0,
    objects = 0,
    bytes = 0,
    checkOnly = false,
    observed = false,
  } = {}) {
    this.assertActive();
    const next = {
      operations: this.operations + operations,
      objects: this.objects + objects,
      bytes: this.bytes + bytes,
    };
    const checks = [
      ["operations", "maxOperations"],
      ["objects", "maxObjects"],
      ["bytes", "maxBytes"],
    ];
    let exceeded = null;
    for (const [counter, limitName] of checks) {
      const limit = this.limits[limitName];
      if (Number.isFinite(limit) && next[counter] > limit) {
        exceeded = new SafetyBudgetError(counter, limit, next[counter]);
        break;
      }
    }
    if (checkOnly) {
      if (exceeded) throw exceeded;
      return this.snapshot();
    }
    if (exceeded && !observed) throw exceeded;
    Object.assign(this, next);
    if (exceeded) throw exceeded;
    return this.snapshot();
  }

  assertCanConsume(delta = {}) {
    return this.consume({ ...delta, checkOnly: true });
  }

  recordRequest(body) {
    return this.consume({ operations: 1, bytes: valueBytes(body) });
  }

  recordResponse(body) {
    return this.recordResponseBytes(valueBytes(body));
  }

  recordResponseBytes(bytes) {
    return this.consume({ bytes, observed: true });
  }

  recordObjects(count = 1) {
    return this.consume({ objects: count });
  }

  snapshot() {
    return {
      operations: this.operations,
      objects: this.objects,
      bytes: this.bytes,
      deadlineAt: this.deadlineAt,
      limits: { ...this.limits },
    };
  }
}

export class IpcOperationBudget {
  constructor({ send = process.send?.bind(process), signal = null } = {}) {
    if (typeof send !== "function") throw new TypeError("IPC budget requires a send function");
    this.send = send;
    this.signal = signal;
    this.sequence = 0;
    this.pending = new Map();
    this.lastSnapshot = null;
    process.on("message", (message) => {
      if (message?.type !== "s0-budget-response") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) {
        this.lastSnapshot = message.snapshot;
        pending.resolve(message.snapshot);
      } else {
        const error = new SafetyBudgetError(
          message.error?.kind || "unknown",
          message.error?.limit,
          message.error?.actual,
        );
        error.message = message.error?.message || error.message;
        pending.reject(error);
      }
    });
  }

  consume(delta = {}) {
    if (this.signal?.aborted) {
      return Promise.reject(new SafetyBudgetError("deadline", null, "aborted"));
    }
    const id = `${process.pid}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ type: "s0-budget-request", id, delta });
    });
  }

  assertActive() {
    return this.consume({});
  }

  assertCanConsume(delta = {}) {
    return this.consume({ ...delta, checkOnly: true });
  }

  recordRequest(body) {
    return this.consume({ operations: 1, bytes: valueBytes(body) });
  }

  recordResponse(body) {
    return this.recordResponseBytes(valueBytes(body));
  }

  recordResponseBytes(bytes) {
    return this.consume({ bytes, observed: true });
  }

  recordObjects(count = 1) {
    return this.consume({ objects: count });
  }

  snapshot() {
    return this.lastSnapshot;
  }
}
