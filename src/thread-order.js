// Ordering for the PR-review comment list. Threads are arranged by their anchor
// line in the file (ascending) so the right pane reads top-to-bottom in step with
// the document. Threads with no line anchor (general PR comments) sort last, and
// the sort is stable — equal lines keep their incoming (ADO) order.

export function threadLine(t) {
  const n = t && t.threadContext && t.threadContext.rightFileStart
    && t.threadContext.rightFileStart.line;
  return Number.isFinite(n) ? n : null;
}

export function sortThreadsByLine(threads) {
  const list = Array.isArray(threads) ? threads : [];
  return list
    .map((t, i) => ({ t, i, line: threadLine(t) }))
    .sort((a, b) => {
      if (a.line == null && b.line == null) return a.i - b.i;
      if (a.line == null) return 1;
      if (b.line == null) return -1;
      if (a.line !== b.line) return a.line - b.line;
      return a.i - b.i;
    })
    .map((x) => x.t);
}
