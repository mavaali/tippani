// Unit tests for the pure table parse/serialize (run: npm run test:table).
import { parseTable, serializeTable } from "./table.js";

let pass = 0;
let fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

// --- parse ---
const t1 = parseTable("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
eq("parse header", t1.header, ["A", "B"]);
eq("parse rows", t1.rows, [["1", "2"]]);
eq("parse aligns default", t1.aligns, ["none", "none"]);

const t2 = parseTable("| L | C | R |\n|:--|:-:|--:|\n| a | b | c |");
eq("parse aligns", t2.aligns, ["left", "center", "right"]);

eq("parse rejects non-table", parseTable("not a table\njust text"), null);

// Escaped pipe stays in the cell, not a column separator.
const t3 = parseTable("| col |\n| --- |\n| a \\| b |");
eq("parse escaped pipe", t3.rows, [["a \\| b"]]);

// Ragged row is padded to header column count.
const t4 = parseTable("| A | B | C |\n| --- | --- | --- |\n| 1 |");
eq("parse ragged padded", t4.rows, [["1", "", ""]]);

// --- serialize: canonical form ---
const canon = "| A   | B   |\n| --- | --- |\n| 1   | 2   |";
eq("serialize canonical", serializeTable(parseTable(canon)), canon);

// Idempotence: serialize(parse(x)) is stable on its own output.
const s1 = serializeTable(parseTable("|A|B|\n|---|---|\n|1|2|"));
eq("serialize idempotent", serializeTable(parseTable(s1)), s1);

// Alignment markers preserved through a round-trip.
const aligned = serializeTable(parseTable("| L | C | R |\n|:--|:-:|--:|\n| a | bb | c |"));
eq("serialize keeps left", /\|\s*:-+\s*\|/.test(aligned), true);
eq("serialize keeps center", /\|\s*:-+:\s*\|/.test(aligned), true);
eq("serialize keeps right", /\|\s*-+:\s*\|/.test(aligned), true);

// Column widens to the longest cell.
const wide = serializeTable(parseTable("| A | B |\n|---|---|\n| longvalue | y |"));
// Column A widens to "longvalue" (9); column B keeps the 3-wide minimum.
eq("serialize widens column", wide.split("\n")[0], "| A         | B   |");

console.log(`\ntable.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
