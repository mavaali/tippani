export function mapSelectionToSource(markdown, blockRange, quote) {
  const fallbackLine = Number(blockRange?.startLine) || 1;
  const fallback = {
    exact: false,
    start: { line: fallbackLine, offset: 1 },
    end: { line: fallbackLine, offset: 1 },
  };
  if (typeof markdown !== "string" || typeof quote !== "string" || !quote) return fallback;
  const startLine = Number(blockRange?.startLine);
  const endLine = Number(blockRange?.endLine);
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < startLine) {
    return fallback;
  }
  const block = markdown.split("\n").slice(startLine - 1, endLine).join("\n");
  const first = block.indexOf(quote);
  if (first < 0 || block.indexOf(quote, first + 1) >= 0) return fallback;
  const positionAt = (index) => {
    const before = block.slice(0, index);
    const newline = before.lastIndexOf("\n");
    return {
      line: startLine + (before.match(/\n/g) || []).length,
      offset: index - newline,
    };
  };
  return {
    exact: true,
    start: positionAt(first),
    end: positionAt(first + quote.length - 1),
  };
}

export function composeReviewComment(content, {
  quote = "",
  mentions = [],
  hostKind = "ado",
} = {}) {
  let body = String(content || "").trim();
  const used = new Set();
  for (const mention of Array.isArray(mentions) ? mentions : []) {
    const id = String(mention?.id || "").trim();
    const name = String(mention?.displayName || "").trim();
    const marker = String(mention?.marker || (name ? `@${name}` : "")).trim();
    if (!id || !name || !marker || used.has(marker) || !body.includes(marker)) continue;
    used.add(marker);
    if (hostKind === "github") {
      body = body.replace(marker, `@${id}`);
      continue;
    }
    const safeId = id.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeName = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    body = body.replace(marker, `<a href="#" data-vss-mention="version:2.0,${safeId}">@${safeName}</a>`);
  }
  const selected = String(quote || "").trim();
  return selected ? `> ${selected.replace(/\n/g, "\n> ")}\n\n${body}` : body;
}

export function displayAdoMentions(content) {
  return String(content || "").replace(
    /<a\b[^>]*data-vss-mention=(["'])version:2\.0,[^"']+\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote, label) => label.replace(/<[^>]*>/g, ""),
  );
}

export function collectReviewParticipants(pr, threads = []) {
  const byId = new Map();
  const add = (identity) => {
    const id = String(identity?.id || "").trim();
    const displayName = String(identity?.displayName || "").trim();
    if (!id || !displayName || identity?.isContainer) return;
    byId.set(id, {
      id,
      displayName,
      uniqueName: String(identity?.uniqueName || "").trim(),
    });
  };
  add(pr?.createdBy);
  for (const reviewer of pr?.reviewers || []) add(reviewer);
  for (const thread of threads || []) {
    for (const comment of thread?.comments || []) add(comment?.author);
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
