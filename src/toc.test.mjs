// Tests for buildToc — the heading table-of-contents used by the read-only view.
// The critical property is PARITY: the ids buildToc emits must equal the ids
// rehype-slug assigns to the rendered headings, so a TOC anchor (#id) lands on a
// heading. A prior hand-rolled slug diverged on punctuated headings, so clicking
// a TOC entry jumped nowhere.
import { buildToc } from "./toc.js";
import { renderSpecBody } from "./spec-source-map.js";
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// --- basics ------------------------------------------------------------------
const basic = buildToc("# One\n\ntext\n\n## Two\n");
ok("count", basic.length === 2);
ok("levels", basic[0].level === 1 && basic[1].level === 2);
ok("simple ids", basic[0].id === "one" && basic[1].id === "two");
ok("no heading -> empty", buildToc("just prose\n\nmore").length === 0);

// --- parity with rehype-slug (the regression guard) --------------------------
const heads = [
  "CFPX → MSPDI → Tasks",
  "Persistence, MS Project, import/export",
  "Deliverables / Done When (draft)",
  "Duplicate",
  "Duplicate",
];
const body = heads.map((h) => `## ${h}\n\ntext\n`).join("\n");
const toc = buildToc(body);
const { html } = await renderSpecBody(body, undefined, { includeHeadings: true });
const renderedIds = [...html.matchAll(/<h2[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
ok("parity count", toc.length === renderedIds.length);
ok("parity ids match rendered heading ids", JSON.stringify(toc.map((x) => x.id)) === JSON.stringify(renderedIds));
ok("punctuation slug", toc[0].id === "cfpx--mspdi--tasks");
ok("duplicate headings get github-slugger suffixes", toc[3].id === "duplicate" && toc[4].id === "duplicate-1");

console.log(`toc: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
