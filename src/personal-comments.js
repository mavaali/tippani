// Pure helpers for the read-only spec page's "Personal Comments" — the file/branch
// scoped notes a spec author leaves on their own draft (no PR). Disk I/O and the
// on-disk key live in index.js; here we only shape the comment list so it stays
// unit-tested. A comment: { id, line, author, content, resolved, createdAt,
// updatedAt, replies }. A reply: { author, content, createdAt }.

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
