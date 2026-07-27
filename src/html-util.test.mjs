// Tests for the shared server-side HTML/render helpers.
import { cssVariables, changeTypeBadge, escHtml, stripMarkdown, jsonForScript } from "./html-util.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// --- escHtml -----------------------------------------------------------------
eq("escapes & < > \"", escHtml(`<a href="x">&`), "&lt;a href=&quot;x&quot;&gt;&amp;");
eq("plain text untouched", escHtml("hello world"), "hello world");
eq("coerces non-string", escHtml(42), "42");
ok("no XSS tag survives", !escHtml("<script>alert(1)</script>").includes("<script>"));

// --- stripMarkdown -----------------------------------------------------------
eq("strips heading", stripMarkdown("# Title"), "Title");
eq("strips bold + italic", stripMarkdown("**bold** and *italic*"), "bold and italic");
eq("strips inline code", stripMarkdown("use `code` here"), "use code here");
eq("strips link to text", stripMarkdown("see [docs](http://x)"), "see docs");
eq("bullets become dots", stripMarkdown("- one"), "• one");
eq("collapses newlines", stripMarkdown("a\n\nb"), "a b");

// --- changeTypeBadge ---------------------------------------------------------
eq("add -> Added/success", changeTypeBadge(1), { label: "Added", color: "success" });
eq("edit -> Modified/accent", changeTypeBadge(2), { label: "Modified", color: "accent" });
eq("unknown -> Modified/accent", changeTypeBadge(99), { label: "Modified", color: "accent" });

// --- cssVariables ------------------------------------------------------------
const css = cssVariables();
ok("cssVariables returns a string", typeof css === "string");
ok("cssVariables includes :root", css.includes(":root"));
ok("cssVariables defines the accent token", css.includes("--cp-accent"));

// --- jsonForScript (stored-XSS guard for inline <script> embeds) -------------
{
  // A </script> in the payload must NOT appear literally — it would close the
  // inline <script> and let the following markup execute.
  const evil = { content: "hi</script><img src=x onerror=alert(1)>" };
  const out = jsonForScript(evil);
  ok("jsonForScript neutralizes </script>", !out.includes("</script>"));
  ok("jsonForScript escapes every '<' as \\u003c", !out.includes("<"));
  // It stays valid JSON that parses back to the identical value.
  eq("jsonForScript round-trips via JSON.parse", JSON.parse(out), evil);
}
{
  // U+2028 / U+2029 are valid JSON but illegal raw in a JS string literal.
  const out = jsonForScript("a\u2028b\u2029c");
  ok("escapes U+2028", !out.includes("\u2028") && out.includes("\\u2028"));
  ok("escapes U+2029", !out.includes("\u2029") && out.includes("\\u2029"));
  eq("line-sep round-trips", JSON.parse(out), "a\u2028b\u2029c");
}
eq("jsonForScript handles arrays", JSON.parse(jsonForScript([1, "<x>", true])), [1, "<x>", true]);

console.log(`html-util: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
