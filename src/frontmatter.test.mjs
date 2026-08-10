// Frontmatter round-trip: an edited body re-attaches the original YAML block on
// commit, so committing an edited spec never drops its frontmatter (data loss on
// Learn/DocFX docs). Preserves the original frontmatter text verbatim.
import { extractFrontmatter, reattachFrontmatter } from "./frontmatter.js";

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

const FM = "---\ntitle: Hello World\nms.date: 07/14/2026\n# a comment\nauthor: jane\n---\n";
const BODY = "# Heading\n\nSome **markdown** body.\n";
const DOC = FM + BODY;

try {
  // extractFrontmatter
  check("extract: pulls the raw block (fences + trailing nl)", extractFrontmatter(DOC) === FM);
  check("extract: none → empty string", extractFrontmatter(BODY) === "");
  check("extract: non-string → empty string", extractFrontmatter(null) === "");
  check("extract: CRLF frontmatter", extractFrontmatter("---\r\ntitle: X\r\n---\r\nbody") === "---\r\ntitle: X\r\n---\r\n");

  // reattach: the core fix
  check("reattach: re-adds frontmatter to an edited body",
    reattachFrontmatter(DOC, "# Edited\n") === FM + "# Edited\n");
  check("reattach: exact round-trip when body unchanged",
    reattachFrontmatter(DOC, BODY) === DOC);
  check("reattach: preserves comments / order / quoting verbatim",
    reattachFrontmatter(DOC, "x").startsWith(FM));

  // idempotent + no-op cases
  check("reattach: body already has frontmatter → unchanged (no double)",
    reattachFrontmatter(DOC, DOC) === DOC);
  check("reattach: original had no frontmatter → body unchanged",
    reattachFrontmatter(BODY, "# Edited\n") === "# Edited\n");
  check("reattach: non-string body → returned as-is", reattachFrontmatter(DOC, null) === null);
  check("reattach: missing original (undefined) → body unchanged",
    reattachFrontmatter(undefined, "# Edited\n") === "# Edited\n");

  // CRLF round-trip
  const crlf = "---\r\ntitle: X\r\n---\r\n# Body\r\n";
  check("reattach: CRLF round-trip", reattachFrontmatter(crlf, "# Body\r\n") === crlf);
} catch (e) {
  fail++;
  console.error("UNEXPECTED THROW:", e && e.stack);
} finally {
  console.log(`\nfrontmatter.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
