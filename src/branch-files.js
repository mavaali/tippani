// Shape a branch's markdown file paths into rows for the Discovery branch page.
// Pure + unit-tested (branch-files.test.mjs). Listing the files themselves is an
// ADO round-trip done server-side; here we only classify (README vs. other),
// split into folder + name, sort, and build the read-only /spec link — no
// network, so it stays testable. README rows are marked (hidden by default in
// the UI, revealed by a checkbox) to match the Specs "Included" README facet.

// A file is a README if its basename is readme.md (case-insensitive), at any depth.
export function isReadmeFile(filePath) {
  const base = String(filePath || "").split("/").pop() || "";
  return base.toLowerCase() === "readme.md";
}

// "/docs/specs/foo.md" -> { dir: "docs/specs", name: "foo.md" }.
// Leading/trailing slashes are trimmed; a top-level file has dir: "".
export function splitSpecPath(filePath) {
  const clean = String(filePath || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const i = clean.lastIndexOf("/");
  return i < 0
    ? { dir: "", name: clean }
    : { dir: clean.slice(0, i), name: clean.slice(i + 1) };
}

// Build the read-only spec link for a branch file: reuses the existing /spec
// review page (which carries the comment/threads pane), pinned to this branch.
// An optional `back` (a relative path) is threaded so /spec returns to the
// branch page instead of the Specs tab.
export function buildSpecHref({ repoId, repoName, project, ref, path: filePath, back } = {}) {
  const branch = String(ref || "").replace(/^refs\/heads\//, "");
  const q = [
    ["repo", repoId],
    ["path", filePath],
    ["repoName", repoName],
    ["project", project],
    ["branch", branch],
    ["back", back],
  ]
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return "/spec?" + q;
}

// Shape md file paths into sorted rows. Every row is returned (README included,
// flagged); the UI hides READMEs by default and a checkbox reveals them, so the
// toggle is instant and needs no refetch. Non-.md paths are dropped.
export function branchFileRows(paths, ctx = {}) {
  const rows = [];
  for (const p of paths || []) {
    const path = String(p || "").trim();
    if (!path || !path.toLowerCase().endsWith(".md")) continue;
    const { dir, name } = splitSpecPath(path);
    rows.push({
      path,
      dir,
      name,
      isReadme: isReadmeFile(path),
      href: buildSpecHref({ ...ctx, path }),
    });
  }
  return rows.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
}

// How many rows are visible for a given "show READMEs" state — drives the count
// label so it agrees with what the list actually shows.
export function visibleFileCount(rows, showReadme) {
  return (rows || []).filter((r) => showReadme || !r.isReadme).length;
}

// Extract the markdown files a branch actually changed, from an ADO commit-diff
// changes array (base = default branch, target = the branch, common commit).
// Keeps only .md files that still exist on the branch (drops pure deletes),
// deduped and order-preserving. changeType may be a number (flags enum) or a
// string ("edit", "delete", "rename, edit") depending on the SDK response.
export function mdPathsFromChanges(changes) {
  const DELETE_BIT = 16;
  const seen = new Set();
  const out = [];
  for (const c of changes || []) {
    if (!c || !c.item) continue;
    if (c.item.isFolder) continue;
    const path = String(c.item.path || "");
    if (!path.toLowerCase().endsWith(".md")) continue;
    const ct = c.changeType;
    const isPureDelete = typeof ct === "number"
      ? ct === DELETE_BIT
      : String(ct || "").trim().toLowerCase() === "delete";
    if (isPureDelete) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}
