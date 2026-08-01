// Tests for the pure link-action resolver. Pure (fs.realpathSync stubbed).
import path from "path";
import { resolveLinkAction } from "./open-external.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// fs whose realpathSync always throws → resolver falls back to the resolved path.
const noRealFs = { realpathSync() { throw new Error("ENOENT"); } };
const repoDir = path.join(path.sep === "\\" ? "C:\\" : "/", "home", "u", "repo");
const base = path.join(repoDir, "README.md");
// containingRoot that reports the repo dir as the approved root of anything under it.
const rootOf = (p) => (typeof p === "string" && (p === repoDir || p.startsWith(repoDir + path.sep)) ? repoDir : null);
const cfg = { fs: noRealFs, isContained: () => false, containingRoot: rootOf };

// URL / scheme handling → external
ok("http opens external url", (() => { const r = resolveLinkAction("http://x.test/a", "", {}); return r.action === "external" && r.kind === "url" && r.target === "http://x.test/a"; })());
ok("https opens external url", (() => { const r = resolveLinkAction("https://x.test/a", base, cfg); return r.action === "external" && r.kind === "url"; })());
ok("mailto opens external url", (() => { const r = resolveLinkAction("mailto:a@b.test", "", {}); return r.action === "external" && r.kind === "url"; })());
ok("javascript scheme rejected", (() => { const r = resolveLinkAction("javascript:alert(1)", base, cfg); return r.error && r.status === 400; })());
ok("data scheme rejected", (() => { const r = resolveLinkAction("data:text/html,x", base, cfg); return r.error && r.status === 400; })());
ok("vbscript scheme rejected", (() => { const r = resolveLinkAction("vbscript:x", base, cfg); return !!r.error; })());
ok("file scheme rejected", (() => { const r = resolveLinkAction("file:///etc/passwd", base, cfg); return r.error && r.status === 400; })());
ok("empty href rejected", (() => { const r = resolveLinkAction("", base, cfg); return r.error && r.status === 400; })());

// .md under the current file's root folder → open in Tippani
ok("md in a subfolder under the root opens in tippani", (() => {
  const r = resolveLinkAction("docs/x.md", base, cfg);
  return r.action === "tippani" && r.path === path.resolve(repoDir, "docs/x.md");
})());
ok("md in the same folder opens in tippani", (() => {
  const r = resolveLinkAction("CHANGELOG.md", base, cfg);
  return r.action === "tippani" && r.path === path.resolve(repoDir, "CHANGELOG.md");
})());
ok("query/hash stripped from md target", (() => {
  const r = resolveLinkAction("docs/x.md?y=1#z", base, cfg);
  return r.action === "tippani" && r.path === path.resolve(repoDir, "docs/x.md");
})());
ok("uppercase .MD still opens in tippani", (() => {
  const r = resolveLinkAction("docs/X.MD", base, cfg);
  return r.action === "tippani";
})());
ok("md under root works even with no containingRoot (falls back to file dir)", (() => {
  const r = resolveLinkAction("docs/x.md", base, { fs: noRealFs, isContained: () => false });
  return r.action === "tippani";
})());

// non-.md under the root → external
ok("non-md under root opens externally", (() => {
  const r = resolveLinkAction("Images/logo.png", base, cfg);
  return r.action === "external" && r.kind === "file";
})());

// escapes above the root
const nested = path.join(repoDir, "docs", "guide.md");
ok("md that escapes the root is rejected", (() => {
  const r = resolveLinkAction("../../secret.md", nested, cfg);
  return r.error && r.status === 403;
})());
ok("md in a DIFFERENT approved root opens externally, not in tippani", (() => {
  const r = resolveLinkAction("../../other/x.md", nested, { fs: noRealFs, isContained: () => true, containingRoot: rootOf });
  return r.action === "external" && r.kind === "file";
})());

// relative with no open file → rejected
ok("relative with no open file rejected", (() => {
  const r = resolveLinkAction("docs/x.md", "", { fs: noRealFs });
  return r.error && r.status === 400;
})());

console.log(`open-external: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
