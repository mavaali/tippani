// Tests for the pure Reading-list shaping (pinned User Manual + user entries).
import path from "node:path";
import { manualTile, buildReadingList, isPinnedManual, manualRoot } from "./reading-list.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// A fake fs where only the README path exists, and realpath is identity.
const README = "/pkg/README.md";
const fsHave = { existsSync: (p) => p === README, realpathSync: (p) => p };
const fsMissing = { existsSync: () => false, realpathSync: (p) => p };

// --- manualTile ---
const t = manualTile({ readmePath: README, fs: fsHave, path });
ok("manual tile resolves the README", t && t.path === README);
ok("manual tile is pinned", t && t.pinned === true);
ok("manual tile is named a user manual", t && /User Manual/.test(t.name));
ok("manual tile carries a summary hint", t && typeof t.summary === "string" && t.summary.length > 0);
ok("manual tile opens via open-file-view", t && t.openHref === `/open-file-view?path=${encodeURIComponent(README)}`);
ok("manual tile is null when README missing", manualTile({ readmePath: README, fs: fsMissing, path }) === null);

// --- buildReadingList ---
const entries = [{ path: "/docs/a.md", addedAt: "t1" }, { path: "/docs/b.md", addedAt: "t2" }];
const listed = buildReadingList({ entries, readmePath: README, fs: fsHave, path });
ok("reading list ends with the pinned manual", listed[listed.length - 1] && listed[listed.length - 1].pinned === true && listed[listed.length - 1].path === README);
ok("reading list keeps user files before the manual", listed.length === 3 && listed[0].path === "/docs/a.md" && listed[1].path === "/docs/b.md");
ok("user tiles are not pinned", listed[0].pinned === false && listed[1].pinned === false);

// De-dupe: a user entry equal to the README must not double the manual.
const dupe = buildReadingList({ entries: [{ path: README }], readmePath: README, fs: fsHave, path });
ok("manual is de-duplicated from a matching user entry", dupe.length === 1 && dupe[0].pinned === true);

// Never empty: even with no user files the manual shows.
const only = buildReadingList({ entries: [], readmePath: README, fs: fsHave, path });
ok("reading list is never empty (manual always present)", only.length === 1 && only[0].pinned === true);

// When the README is missing the list falls back to just the user files.
const noManual = buildReadingList({ entries, readmePath: README, fs: fsMissing, path });
ok("no manual tile when README missing", noManual.length === 2 && noManual.every((e) => !e.pinned));

// --- isPinnedManual / manualRoot ---
ok("isPinnedManual true for the README", isPinnedManual(README, { readmePath: README, fs: fsHave, path }) === true);
ok("isPinnedManual false for a user file", isPinnedManual("/docs/a.md", { readmePath: README, fs: fsHave, path }) === false);
ok("manualRoot is the README folder", manualRoot({ readmePath: README, fs: fsHave, path }) === path.dirname(README));
ok("manualRoot null when README missing", manualRoot({ readmePath: README, fs: fsMissing, path }) === null);

console.log(`reading-list: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
