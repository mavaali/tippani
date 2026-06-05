// Pure GFM pipe-table parse + canonical serialize. No CodeMirror dependency, so it
// is unit-testable in plain Node (see table.test.mjs). The table widget (#45) uses
// these to render a grid and to write canonical markdown back to the buffer.
//
// "Canonical" = deterministic column padding, so an unedited table that already
// happens to be canonical round-trips byte-identical, and an edited table produces
// stable, low-noise diffs.

// Count display columns by code points (good enough for spec text; no East-Asian
// width handling).
function width(s) {
  return [...s].length;
}

// Split a table row on unescaped pipes, dropping the leading/trailing empties that
// come from the outer | ... | delimiters.
function splitRow(line) {
  const cells = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      cur += ch + line[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  // Drop the empty cell before the first pipe and after the last pipe.
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function parseAlign(spec) {
  const s = spec.trim();
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "none";
}

// Parse pipe-table source (the exact slice of the document) into a structured
// model. Returns null if it doesn't look like a GFM table.
export function parseTable(src) {
  const lines = src.replace(/\n$/, "").split("\n");
  if (lines.length < 2) return null;
  const header = splitRow(lines[0]);
  const delim = splitRow(lines[1]);
  if (!delim.length || !delim.every((d) => /^:?-+:?$/.test(d.trim()))) return null;
  const cols = header.length;
  const aligns = [];
  for (let c = 0; c < cols; c++) aligns.push(parseAlign(delim[c] || "---"));
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const cells = splitRow(lines[i]);
    const row = [];
    for (let c = 0; c < cols; c++) row.push(cells[c] ?? "");
    rows.push(row);
  }
  return { aligns, header, rows };
}

function delimCell(align, w) {
  // Minimum dash count keeps each delimiter at least 3 wide.
  switch (align) {
    case "left":
      return ":" + "-".repeat(Math.max(2, w - 1));
    case "right":
      return "-".repeat(Math.max(2, w - 1)) + ":";
    case "center":
      return ":" + "-".repeat(Math.max(1, w - 2)) + ":";
    default:
      return "-".repeat(Math.max(3, w));
  }
}

function pad(s, w) {
  return s + " ".repeat(Math.max(0, w - width(s)));
}

// Serialize a model back to canonical pipe-table markdown (no trailing newline).
export function serializeTable({ aligns, header, rows }) {
  const cols = header.length;
  const colWidth = [];
  for (let c = 0; c < cols; c++) {
    let w = width(header[c] || "");
    for (const row of rows) w = Math.max(w, width(row[c] || ""));
    colWidth.push(Math.max(3, w));
  }
  const renderRow = (cells) =>
    "| " + cells.map((cell, c) => pad(cell || "", colWidth[c])).join(" | ") + " |";
  const out = [];
  out.push(renderRow(header));
  out.push(
    "| " + aligns.map((a, c) => pad(delimCell(a, colWidth[c]), colWidth[c])).join(" | ") + " |"
  );
  for (const row of rows) out.push(renderRow(row));
  return out.join("\n");
}
