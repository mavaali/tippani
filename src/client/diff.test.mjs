// Unit tests for the line diff (run: npm run test:diff). Written test-first.
import { diffLines, diffStats } from "./diff.js";

let pass = 0;
let fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`);
  }
}
const types = (d) => d.map((x) => x.type).join(",");
const texts = (d, t) => d.filter((x) => x.type === t).map((x) => x.text);

// Identical input → all context, no changes.
eq("identical types", types(diffLines("a\nb\nc", "a\nb\nc")), "ctx,ctx,ctx");
eq("identical stats", diffStats(diffLines("a\nb\nc", "a\nb\nc")), { added: 0, removed: 0 });

// Pure insertion.
const ins = diffLines("a\nb", "a\nx\nb");
eq("insertion added line", texts(ins, "add"), ["x"]);
eq("insertion removed none", texts(ins, "del"), []);

// Pure deletion.
const del = diffLines("a\nb\nc", "a\nc");
eq("deletion removed line", texts(del, "del"), ["b"]);
eq("deletion added none", texts(del, "add"), []);

// A changed line shows as a delete + add.
const chg = diffLines("a\nb\nc", "a\nB\nc");
eq("change removed", texts(chg, "del"), ["b"]);
eq("change added", texts(chg, "add"), ["B"]);
eq("change stats", diffStats(chg), { added: 1, removed: 1 });

// Empty sides.
eq("all added from empty", texts(diffLines("", "x\ny"), "add"), ["x", "y"]);
eq("all removed to empty", texts(diffLines("x\ny", ""), "del"), ["x", "y"]);

// Order is preserved (del before add for an in-place change region).
eq("change order", types(diffLines("a\nb", "a\nB")), "ctx,del,add");

console.log(`\ndiff.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
