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

import { randomUUID } from "node:crypto";

export function createFocusStore({ navEpoch = randomUUID() } = {}) {
  let focusedThreadId = null;
  let version = 0;
  // Single-tab navigation: which portal path the LLM wants the user's ONE open
  // browser tab pointed at. navSeq is monotonic so the browser acts once per
  // request (and survives same-tab reloads via sessionStorage on the client).
  let navUrl = null;
  let navSeq = 0;
  // Which spec view the browser should show for the current file (item 3).
  // null = default (Original). Server-side so the agent (set_view) can drive it
  // and it survives a same-tab reload; the browser never auto-flips on a stage.
  let view = null;      // "original" | "diff" | "current"
  let viewSeq = 0;
  // Feedback-page filter criteria the browser should apply (item 5). null = no
  // server-pushed filter. The agent (set_feedback_filter) sets it; the manual
  // filter bar mirrors the same shape locally.
  let filter = null;    // { states?, reviewer?, file?, query? }
  let filterSeq = 0;
  // Personal Comments (read-only /spec reviewing page). pcContext is the file the
  // open reviewing page is showing (set server-side when /spec renders), so
  // param-less MCP tools act on "the open file". pcSelectedId is the selected
  // comment (the page reports its focused card; MCP nav sets it). pcCommand is a
  // one-shot instruction the page executes (focus a comment, hide/show resolved);
  // pcDataSeq bumps whenever comments mutate so the page re-fetches.
  let pcContext = null; // { repo, branch, path }
  let pcSelectedId = null;
  let pcCommand = null; // { type: 'focus'|'showResolved', id?, show? }
  let pcCommandSeq = 0;
  let pcDataSeq = 0;
  // Same-page scroll target: the source line the agent (go_to_line) wants the
  // ONE open file page scrolled to. lineSeq is monotonic so the page scrolls
  // once per request; the page baselines lineSeq on first poll so a stale
  // command doesn't yank a freshly opened file.
  let line = null;
  let lineSeq = 0;
  const VIEWS = ["current", "diff", "proposed"];
  return {
    get() {
      return { focusedThreadId, version, navUrl, navSeq, navEpoch, view, viewSeq, filter, filterSeq, pcContext, pcSelectedId, pcCommand, pcCommandSeq, pcDataSeq, line, lineSeq };
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
    // Request the browser navigate its current tab to `url` (single-tab mode).
    // Always bumps navSeq + version so a repeat nav to the same path still fires.
    setNav(url) {
      if (typeof url !== "string" || !url) {
        throw new Error("nav: url must be a non-empty string");
      }
      navUrl = url;
      navSeq++;
      version++;
      return { navUrl, navSeq, navEpoch, version };
    },
    // Set the spec view the browser should switch to (item 3). Always bumps so a
    // repeat set to the same view still fires the browser's apply.
    setView(v) {
      if (!VIEWS.includes(v)) {
        throw new Error(`view: must be one of ${VIEWS.join("|")}`);
      }
      view = v;
      viewSeq++;
      version++;
      return { view, viewSeq, version };
    },
    // Set (or clear, with null) the feedback filter the browser should apply.
    setFilter(f) {
      if (f !== null && (typeof f !== "object" || Array.isArray(f))) {
        throw new Error("filter: must be an object or null");
      }
      filter = f;
      filterSeq++;
      version++;
      return { filter, filterSeq, version };
    },
    bumpVersion() {
      version++;
      return version;
    },
    // Scroll the open file page to a 1-based source line (go_to_line). Always
    // bumps lineSeq + version so a repeat go-to the same line still fires.
    setLine(n) {
      const next = Number(n);
      if (!Number.isInteger(next) || next < 1) {
        throw new Error("go-to-line: line must be a positive integer");
      }
      line = next;
      lineSeq++;
      version++;
      return { line, lineSeq, version };
    },
    // --- Personal Comments ---
    setPcContext(ctx) {
      pcContext = (ctx && ctx.repo && ctx.branch && ctx.path)
        ? { repo: String(ctx.repo), branch: String(ctx.branch), path: String(ctx.path) }
        : null;
      return pcContext;
    },
    setPcSelected(id) {
      pcSelectedId = id == null || id === "" ? null : String(id);
      return pcSelectedId;
    },
    // Push a one-shot command to the open reviewing page. Always bumps the seq so
    // a repeat (e.g. focus the same comment again) still fires.
    setPcCommand(cmd) {
      pcCommand = cmd || null;
      pcCommandSeq++;
      version++;
      return { pcCommand, pcCommandSeq };
    },
    // Signal that the file's comments changed so the page re-fetches + re-renders.
    bumpPcData() {
      pcDataSeq++;
      version++;
      return pcDataSeq;
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

// String-keyed sibling of createLockStore (clickstop 2, step 11). The remote
// spec-authoring "user is editing" lock is keyed by a composite
// `repo\nbranch\npath` string, not a numeric thread id, so it must NOT coerce
// the key to a Number. Same sliding-window TTL semantics otherwise.
export function createKeyedLockStore({ ttlMs = 10_000, now = Date.now } = {}) {
  const locks = new Map();
  function prune(t) {
    for (const [key, exp] of locks.entries()) {
      if (exp <= t) locks.delete(key);
    }
  }
  return {
    touch(key) {
      if (!key || typeof key !== "string") throw new Error("lock: key must be a non-empty string");
      const t = now();
      prune(t);
      locks.set(key, t + ttlMs);
      return locks.get(key);
    },
    isLocked(key) {
      const t = now();
      prune(t);
      return locks.has(key);
    },
    release(key) {
      return locks.delete(key);
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
