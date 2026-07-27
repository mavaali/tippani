// Pure helpers for the read-only spec page's "Personal Comments" — the file/branch
// scoped notes a spec author leaves on their own draft (no PR). Disk I/O and the
// on-disk key live in index.js; here we only shape the comment list so it stays
// unit-tested. A comment: { id, line, author, content, resolved, createdAt,
// updatedAt, replies }. A reply: { author, content, createdAt }.
import crypto from "node:crypto";

// Build a fresh comment record. `line` is the 1-based source line the anchored
// block starts on (null for an unanchored note).
export function newComment({ id, line, author, content, now }) {
  const n = now || new Date().toISOString();
  return {
    id: String(id || ""),
    line: line == null ? null : Number(line),
    author: String(author || ""),
    content: String(content == null ? "" : content),
    resolved: false,
    createdAt: n,
    updatedAt: n,
    replies: [],
  };
}

export function addComment(list, comment) {
  return [...(list || []), comment];
}

// Replace a comment's content (and bump updatedAt). Unknown id -> unchanged.
export function updateComment(list, id, content, now) {
  const n = now || new Date().toISOString();
  return (list || []).map((c) =>
    c.id === id ? { ...c, content: String(content == null ? "" : content), updatedAt: n } : c
  );
}

// Toggle/set a comment's resolved flag (and bump updatedAt). Unknown id -> unchanged.
export function setResolved(list, id, resolved, now) {
  const n = now || new Date().toISOString();
  return (list || []).map((c) =>
    c.id === id ? { ...c, resolved: !!resolved, updatedAt: n } : c
  );
}

// Append a reply to a comment (and bump its updatedAt). A reply is a follow-up
// note — e.g. the assistant recording how it addressed the feedback. Unknown id
// or empty content -> unchanged.
export function addReply(list, id, { author, content, now } = {}) {
  const text = String(content == null ? "" : content).trim();
  if (!text) return list || [];
  const n = now || new Date().toISOString();
  return (list || []).map((c) =>
    c.id === id
      ? { ...c, replies: [...(c.replies || []), { author: String(author || ""), content: text, createdAt: n }], updatedAt: n }
      : c
  );
}

export function removeComment(list, id) {
  return (list || []).filter((c) => c.id !== id);
}

export function findComment(list, id) {
  return (list || []).find((c) => c.id === id) || null;
}

// Order by anchor line (unanchored last), then creation time — the order the
// margin lays cards out top-to-bottom.
export function sortComments(list) {
  return (list || []).slice().sort((a, b) => {
    const la = a.line == null ? Infinity : a.line;
    const lb = b.line == null ? Infinity : b.line;
    if (la !== lb) return la - lb;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

// The id to move selection to, given the current selection and a direction over
// an already-sorted list. next/prev wrap around; first/last jump to an end.
// Returns null for an empty list.
export function navTargetId(sortedList, currentId, direction) {
  const ids = (sortedList || []).map((c) => c.id);
  if (!ids.length) return null;
  if (direction === "first") return ids[0];
  if (direction === "last") return ids[ids.length - 1];
  const i = ids.indexOf(currentId);
  if (i < 0) return direction === "prev" ? ids[ids.length - 1] : ids[0];
  const n = ids.length;
  const j = direction === "prev" ? (i - 1 + n) % n : (i + 1) % n;
  return ids[j];
}

// --- Anchor re-resolution -----------------------------------------------------
// Comments freeze to a 1-based `line` at creation, but the whole point of the
// feature is a loop that EDITS the file — which shifts every line below an edit,
// so a purely line-based anchor drifts and cards re-point at the wrong block.
// We give each comment a content-addressed anchor { blockHash, headingPath } and
// re-resolve it against the CURRENT source on every render: hash-match re-points
// the line exactly; a heading-path match tracks a lightly-edited block; a total
// miss keeps the frozen line but marks the card `stale` rather than silently
// mispointing. All pure so it's unit-tested without the page.

function normalizeBlock(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

function asLines(rawText) {
  return Array.isArray(rawText) ? rawText : String(rawText == null ? "" : rawText).split(/\r?\n/);
}

// Stable content hash of a block's source text (whitespace-normalized).
export function hashBlock(text) {
  return crypto.createHash("sha1").update(normalizeBlock(text)).digest("hex").slice(0, 16);
}

function sliceLines(rawText, startLine, endLine) {
  const lines = asLines(rawText);
  return lines.slice(Math.max(0, startLine - 1), Math.max(0, endLine)).join("\n");
}

// The heading chain (outer→inner text) in effect just before a 1-based line.
export function headingPathForLine(rawText, line) {
  const lines = asLines(rawText);
  const stack = []; // { level, text }
  const upto = Math.max(0, Math.min(line - 1, lines.length));
  for (let i = 0; i < upto; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    const text = normalizeBlock(m[2].replace(/#+\s*$/, ""));
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, text });
  }
  return stack.map((h) => h.text);
}

function blockIndexForLine(sourceMap, line) {
  let best = -1, bestDist = Infinity;
  for (let k = 0; k < sourceMap.length; k++) {
    const sm = sourceMap[k];
    if (!sm) continue;
    if (line >= sm.startLine && line <= sm.endLine) return k;
    const d = line < sm.startLine ? sm.startLine - line : line - sm.endLine;
    if (d < bestDist) { bestDist = d; best = k; }
  }
  return best;
}

// Compute an anchor descriptor for a comment sitting at `line`.
export function computeAnchor(rawText, sourceMap, line) {
  if (line == null || !Array.isArray(sourceMap) || !sourceMap.length) {
    return { blockHash: null, headingPath: [] };
  }
  const k = blockIndexForLine(sourceMap, line);
  const sm = k >= 0 ? sourceMap[k] : null;
  return {
    blockHash: sm ? hashBlock(sliceLines(rawText, sm.startLine, sm.endLine)) : null,
    headingPath: headingPathForLine(rawText, line),
  };
}

// Re-resolve every comment's anchor against the current source. Backfills a
// missing anchor (first render after create, when the line is still correct).
// Returns { comments, changed }. Each anchored comment gains `anchor` and
// `anchorState` ∈ 'ok' | 'moved' | 'stale'; `line` is updated when the block
// moved. `changed` is true when anything needs persisting.
export function reanchorComments(comments, rawText, sourceMap) {
  const list = comments || [];
  if (!Array.isArray(sourceMap)) return { comments: list, changed: false };
  const blockHashes = sourceMap.map((sm) =>
    sm ? hashBlock(sliceLines(rawText, sm.startLine, sm.endLine)) : null);
  let changed = false;
  const out = list.map((c) => {
    if (c.line == null) return c; // file-level note — nothing to anchor
    if (!c.anchor || !c.anchor.blockHash) {
      changed = true;
      return { ...c, anchor: computeAnchor(rawText, sourceMap, c.line), anchorState: "ok" };
    }
    // 1) exact content match — re-point the line to the block's current start.
    const hi = blockHashes.indexOf(c.anchor.blockHash);
    if (hi >= 0) {
      const newLine = sourceMap[hi].startLine;
      if (newLine !== c.line || c.anchorState !== "ok") changed = true;
      return { ...c, line: newLine, anchorState: "ok" };
    }
    // 2) heading-path match — the block text changed but its section is intact.
    const want = c.anchor.headingPath || [];
    if (want.length) {
      for (let k = 0; k < sourceMap.length; k++) {
        if (!sourceMap[k]) continue;
        const hp = headingPathForLine(rawText, sourceMap[k].startLine);
        if (hp.length >= want.length && want.every((h, i) => hp[i] === h)) {
          const newLine = sourceMap[k].startLine;
          if (newLine !== c.line || c.anchorState !== "moved") changed = true;
          return { ...c, line: newLine, anchorState: "moved" };
        }
      }
    }
    // 3) gone — keep the frozen line but flag it rather than mispoint silently.
    if (c.anchorState !== "stale") changed = true;
    return { ...c, anchorState: "stale" };
  });
  return { comments: out, changed };
}
