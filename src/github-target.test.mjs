import {
  normalizeGitHubCoordinates,
  parseGitHubTarget,
  selectGitHubToken,
} from "./github-target.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

eq("non-GitHub args", parseGitHubTarget(["123"]), { isGitHub: false });
eq("shorthand", parseGitHubTarget(["github:mavaali/tippani#82"]), {
  isGitHub: true, owner: "mavaali", repo: "tippani", prId: 82,
});
eq("coordinates normalize case and clone suffix", normalizeGitHubCoordinates({
  owner: " MAVAALI ",
  repo: "Tippani.git",
}), {
  owner: "mavaali", repo: "tippani",
});
eq("target normalizes case and clone suffix", parseGitHubTarget([
  "github:MAVAALI/Tippani.git#82",
]), {
  isGitHub: true, owner: "mavaali", repo: "tippani", prId: 82,
});
eq("PR URL", parseGitHubTarget([
  "https://github.com/mavaali/tippani/pull/82",
]), {
  isGitHub: true, owner: "mavaali", repo: "tippani", prId: 82,
});
eq("flag + positional PR", parseGitHubTarget([
  "82", "--github=mavaali/tippani",
]), {
  isGitHub: true, owner: "mavaali", repo: "tippani", prId: 82,
});
ok("bad coordinate errors", !!parseGitHubTarget([
  "82", "--github=bad",
]).error);
ok("missing PR errors", !!parseGitHubTarget([
  "--github=mavaali/tippani",
]).error);
eq("browse target needs coordinates but no PR", parseGitHubTarget([
  "--browse", "--github=mavaali/tippani",
]), {
  isGitHub: true, owner: "mavaali", repo: "tippani", prId: null,
});
eq("repo from env", parseGitHubTarget(["82"], {
  TIPPANI_GH_REPO: "mavaali/tippani",
}), {
  isGitHub: true, owner: "mavaali", repo: "tippani", prId: 82,
});

eq("CLI token wins", selectGitHubToken({
  args: ["--gh-token=cli"],
  env: { TIPPANI_GH_TOKEN: "env" },
  execGh: () => "gh",
}), { token: "cli", source: "cli" });
eq("env token", selectGitHubToken({
  env: { TIPPANI_GH_TOKEN: "env" },
}), { token: "env", source: "env" });
eq("gh CLI fallback", selectGitHubToken({
  execGh: () => "gh-token\n",
}), { token: "gh-token", source: "gh-cli" });
eq("no token", selectGitHubToken({
  execGh: () => { throw new Error("not signed in"); },
}), { token: null, source: "none" });

console.log(`\ngithub-target.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
