// Tests for the NAV_WATCHER steering guard (single-tab nav).
import { navCursor, navSkipsBarePathClobber, navShouldNavigate, navTarget } from "./nav-guard.js";

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

const ORIGIN = "http://localhost:3847";

try {
  check("nav cursor applies the next command in one process",
    navCursor("epoch-a", 8, "epoch-a", 7).shouldApply === true);
  check("nav cursor suppresses an already-applied command in one process",
    navCursor("epoch-a", 7, "epoch-a", 7).shouldApply === false);
  const restarted = navCursor("epoch-b", 1, "epoch-a", 999);
  check("nav cursor resets a stale sequence after same-port process restart",
    restarted.epoch === "epoch-b" && restarted.lastSeq === 0 && restarted.shouldApply === true);
  const restartedIdle = navCursor("epoch-b", 0, "epoch-a", 999);
  check("nav cursor records a restart without replaying an empty command",
    restartedIdle.epoch === "epoch-b" && restartedIdle.lastSeq === 0 && restartedIdle.shouldApply === false);

  // The core bug: a bare-path nav target must NOT strip a deliberate ?edit=1.
  check("skips bare-path nav that would only strip ?edit=1",
    navShouldNavigate({ pathname: "/file/0", search: "?edit=1" }, "/file/0", ORIGIN) === false);

  check("fires for cross-file nav",
    navShouldNavigate({ pathname: "/file/1", search: "" }, "/file/0", ORIGIN) === true);

  check("fires for cross-file nav even when current has a query",
    navShouldNavigate({ pathname: "/file/1", search: "?edit=1" }, "/file/0", ORIGIN) === true);

  check("fires for same-path line-jump deep-link (target has its own query)",
    navShouldNavigate({ pathname: "/file/0", search: "" }, "/file/0?line=50", ORIGIN) === true);

  check("fires when target query differs from current query",
    navShouldNavigate({ pathname: "/file/0", search: "?edit=1" }, "/file/0?line=50", ORIGIN) === true);

  check("no-ops when already at the exact target",
    navShouldNavigate({ pathname: "/file/0", search: "" }, "/file/0", ORIGIN) === false);

  check("returns false for a malformed navUrl",
    navShouldNavigate({ pathname: "/file/0", search: "?edit=1" }, "http://[::bad", ORIGIN) === false);

  // same-origin safety (folded in from the reliability nav guard)
  check("rejects a foreign absolute URL",
    navShouldNavigate({ pathname: "/file/0", search: "" }, "https://evil.example/steal", ORIGIN) === false);
  check("rejects a javascript: URL",
    navShouldNavigate({ pathname: "/file/0", search: "" }, "javascript:alert(1)", ORIGIN) === false);
  check("accepts a same-origin absolute URL",
    navShouldNavigate({ pathname: "/file/1", search: "" }, ORIGIN + "/file/0", ORIGIN) === true);
  check("fires for a same-path hash jump",
    navShouldNavigate({ pathname: "/file/0", search: "", hash: "" }, "/file/0#objectives", ORIGIN) === true);
  check("no-ops when already at the exact target incl. hash",
    navShouldNavigate({ pathname: "/file/0", search: "", hash: "#objectives" }, "/file/0#objectives", ORIGIN) === false);

  // predicate unit checks
  check("clobber-guard: same-path bare target with live query -> true",
    navSkipsBarePathClobber("?edit=1", "/file/0", "/file/0", "") === true);
  check("clobber-guard: no current query -> false",
    navSkipsBarePathClobber("", "/file/0", "/file/0", "") === false);
  check("clobber-guard: different path -> false",
    navSkipsBarePathClobber("?edit=1", "/file/0", "/file/1", "") === false);
  check("clobber-guard: target carries its own query -> false",
    navSkipsBarePathClobber("?edit=1", "/file/0", "/file/0", "?line=5") === false);

  // navTarget: the resolved same-origin path the watcher actually navigates to
  // (never the raw navUrl), or null when off-origin/malformed.
  check("navTarget: relative path -> same-origin path",
    navTarget("/file/0?edit=1", ORIGIN) === "/file/0?edit=1");
  check("navTarget: same-origin absolute -> path only",
    navTarget(ORIGIN + "/file/0#h", ORIGIN) === "/file/0#h");
  check("navTarget: foreign absolute -> null",
    navTarget("https://evil.example/x", ORIGIN) === null);
  check("navTarget: javascript: -> null",
    navTarget("javascript:alert(1)", ORIGIN) === null);
  check("navTarget: protocol-relative //host -> null",
    navTarget("//evil.example/x", ORIGIN) === null);
  check("navTarget: malformed -> null",
    navTarget("http://[::bad", ORIGIN) === null);
} catch (e) {
  fail++;
  console.error("UNEXPECTED THROW:", e && e.stack);
} finally {
  console.log(`\nnav-guard.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
