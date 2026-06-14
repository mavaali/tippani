// In-memory control-API state for Phase 1 (#42).
//
// Three concerns, kept as small pure factories so they can be unit-tested
// without spinning an HTTP server:
//   - createFocusStore() — which thread the LLM/keyboard navigation wants the
//     user looking at right now. One-cell state. Bumps a monotonic version on
//     every set so the browser can detect changes via long-poll/poll.
//   - createDraftStore() — staged reply drafts per thread, addressed by
//     threadId. Each set bumps the same shared version counter so a single
//     /api/state poll covers focus + drafts.
//   - createLockStore({ ttlMs }) — short-lived "user is typing in this thread"
//     locks. Used to reject PUT /threads/:id/draft with 409 when a human is
//     actively editing that thread's textarea.
//
// All three intentionally avoid persistence: drafts and focus are ephemeral
// (per the Phase 1 design decision — "ephemeral, server memory only"), and
// the LLM re-stages in milliseconds if it loses its slot.

export function createFocusStore() {
  let focusedThreadId = null;
  let version = 0;
  return {
    get() {
      return { focusedThreadId, version };
    },
    set(threadId) {
      const next = threadId == null ? null : Number(threadId);
      if (next !== null && !Number.isFinite(next)) {
        throw new Error("focus: threadId must be a number or null");
      }
      if (next !== focusedThreadId) {
        focusedThreadId = next;
        version++;
      }
      return { focusedThreadId, version };
    },
    bumpVersion() {
      version++;
      return version;
    },
  };
}

export function createDraftStore({ onChange } = {}) {
  // Map<threadId, { content, source, updatedAt }>
  const drafts = new Map();
  function notify() {
    if (typeof onChange === "function") onChange();
  }
  return {
    get(threadId) {
      const id = Number(threadId);
      return drafts.get(id) || null;
    },
    list() {
      const out = {};
      for (const [id, d] of drafts.entries()) out[id] = { ...d };
      return out;
    },
    put(threadId, content, { source = "external" } = {}) {
      const id = Number(threadId);
      if (!Number.isFinite(id)) throw new Error("draft: threadId must be a number");
      if (typeof content !== "string") throw new Error("draft: content must be a string");
      drafts.set(id, { content, source, updatedAt: Date.now() });
      notify();
      return drafts.get(id);
    },
    delete(threadId) {
      const id = Number(threadId);
      const had = drafts.delete(id);
      if (had) notify();
      return had;
    },
    clear() {
      const had = drafts.size > 0;
      drafts.clear();
      if (had) notify();
    },
  };
}

export function createLockStore({ ttlMs = 10_000, now = Date.now } = {}) {
  // Map<threadId, expiresAt>. A "lock" is just a sliding-window timestamp; if
  // the user keeps typing, the browser keeps touching, and the lock stays
  // alive. If they stop for ttlMs, the LLM gets the lane back.
  const locks = new Map();
  function prune(t) {
    for (const [id, exp] of locks.entries()) {
      if (exp <= t) locks.delete(id);
    }
  }
  return {
    touch(threadId) {
      const id = Number(threadId);
      if (!Number.isFinite(id)) throw new Error("lock: threadId must be a number");
      const t = now();
      prune(t);
      locks.set(id, t + ttlMs);
      return locks.get(id);
    },
    isLocked(threadId) {
      const id = Number(threadId);
      const t = now();
      prune(t);
      return locks.has(id);
    },
    release(threadId) {
      const id = Number(threadId);
      return locks.delete(id);
    },
    size() {
      prune(now());
      return locks.size;
    },
  };
}

// Conflict guard for /api/reply: per-thread "a reply is currently being
// posted to ADO" flag. Used to return 409 if a second concurrent reply comes
// in for the same thread before the first finishes (avoid double-post on
// jittery clicks or competing LLM + human posts).
export function createInflightStore() {
  const inflight = new Set();
  return {
    has(threadId) { return inflight.has(Number(threadId)); },
    acquire(threadId) {
      const id = Number(threadId);
      if (inflight.has(id)) return false;
      inflight.add(id);
      return true;
    },
    release(threadId) { inflight.delete(Number(threadId)); },
    size() { return inflight.size; },
  };
}
