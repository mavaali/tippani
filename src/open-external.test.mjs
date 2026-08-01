// Tests for the pure external-link resolver. Pure (fs.realpathSync stubbed).
import path from "path";
import { resolveExternalLinkTarget } from "./open-external.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// fs whose realpathSync always throws → resolver falls back to the abs path.
const noRealFs = { realpathSync() { throw new Error("ENOENT"); } };
const base = path.join(path.sep === "\\" ? "C:\\" : "/", "home", "u", "repo", "README.md");
const repoDir = path.dirname(base);

// URL / scheme handling
ok("http opens as url", (() => { const r = resolveExternalLinkTarget("http://x.test/a", "", {}); return r.ok && r.kind === "url" && r.target === "http://x.test/a"; })());
ok("https opens as url", (() => { const r = resolveExternalLinkTarget("https://x.test/a", base, {}); return r.ok && r.kind === "url"; })());
ok("mailto opens as url", (() => { const r = resolveExternalLinkTarget("mailto:a@b.test", "", {}); return r.ok && r.kind === "url"; })());
ok("javascript scheme rejected", (() => { const r = resolveExternalLinkTarget("javascript:alert(1)", base, {}); return !r.ok && r.status === 400; })());
ok("data scheme rejected", (() => { const r = resolveExternalLinkTarget("data:text/html,x", base, {}); return !r.ok && r.status === 400; })());
ok("vbscript scheme rejected", (() => { const r = resolveExternalLinkTarget("vbscript:x", base, {}); return !r.ok; })());
ok("file scheme rejected", (() => { const r = resolveExternalLinkTarget("file:///etc/passwd", base, {}); return !r.ok && r.status === 400; })());
ok("empty href rejected", (() => { const r = resolveExternalLinkTarget("", base, {}); return !r.ok && r.status === 400; })());

// Relative links resolve against the open file's directory
ok("relative sibling within doc tree is allowed", (() => {
  const r = resolveExternalLinkTarget("docs/x.md", base, { fs: noRealFs, isContained: () => false });
  return r.ok && r.kind === "file" && r.target === path.resolve(repoDir, "docs/x.md");
})());
ok("relative same-dir file allowed", (() => {
  const r = resolveExternalLinkTarget("CHANGELOG.md", base, { fs: noRealFs, isContained: () => false });
  return r.ok && r.target === path.resolve(repoDir, "CHANGELOG.md");
})());
ok("query/hash stripped from relative file target", (() => {
  const r = resolveExternalLinkTarget("docs/x.md?y=1#z", base, { fs: noRealFs, isContained: () => false });
  return r.ok && r.target === path.resolve(repoDir, "docs/x.md");
})());
ok("escape above doc tree rejected when not in an approved root", (() => {
  const r = resolveExternalLinkTarget("../../secret.md", base, { fs: noRealFs, isContained: () => false });
  return !r.ok && r.status === 403;
})());
ok("escape above doc tree allowed when inside an approved root", (() => {
  const r = resolveExternalLinkTarget("../sibling/x.md", base, { fs: noRealFs, isContained: () => true });
  return r.ok && r.kind === "file";
})());
ok("relative with no open file rejected", (() => {
  const r = resolveExternalLinkTarget("docs/x.md", "", { fs: noRealFs });
  return !r.ok && r.status === 400;
})());

console.log(`open-external: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
