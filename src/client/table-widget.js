// GFM table block widget (#45). Replaces a pipe-table's source with an editable
// grid. Block decorations span line breaks, so they must come from a StateField
// (a ViewPlugin may not emit them).
//
// Editing model: cells are contenteditable islands. While the user types, the
// document is NOT touched — we sync once, on focus leaving the whole table, and
// only when cell content actually changed. So focusing a (possibly non-canonical)
// table without editing never reformats it: unedited tables round-trip
// byte-identical. A real edit serializes the whole table to canonical markdown.

import { WidgetType, Decoration, EditorView } from "@codemirror/view";
import { StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { parseTable, serializeTable } from "./table.js";

const ALIGN_CSS = { left: "left", center: "center", right: "right", none: "left" };

// Find the Table node enclosing a document position.
function tableRangeAt(state, pos) {
  let node = syntaxTree(state).resolveInner(Math.min(pos + 1, state.doc.length), 1);
  while (node && node.name !== "Table") node = node.parent;
  return node ? { from: node.from, to: node.to } : null;
}

function sameContent(a, b) {
  return JSON.stringify({ h: a.header, r: a.rows }) ===
    JSON.stringify({ h: b.header, r: b.rows });
}

class TableWidget extends WidgetType {
  constructor(src, model) {
    super();
    this.src = src;
    this.model = model;
  }
  eq(other) {
    return other.src === this.src;
  }

  // Read the current grid DOM back into a table model (alignment is unchanged in
  // this slice; structural edits land in slice 3).
  readModel(table) {
    const header = [...table.querySelectorAll("thead th")].map((th) =>
      th.textContent.trim()
    );
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim())
    );
    return { aligns: this.model.aligns, header, rows };
  }

  syncToDoc(view, table) {
    const next = this.readModel(table);
    if (sameContent(next, this.model)) return; // no real edit — leave source as-is
    const md = serializeTable(next);
    const pos = view.posAtDOM(table);
    const range = tableRangeAt(view.state, pos);
    if (!range) return;
    view.dispatch({ changes: { from: range.from, to: range.to, insert: md } });
  }

  toDOM(view) {
    const { aligns, header, rows } = this.model;
    const table = document.createElement("table");
    table.className = "cm-pv-table";

    const mkCell = (tag, text, c) => {
      const el = document.createElement(tag);
      el.textContent = text;
      el.style.textAlign = ALIGN_CSS[aligns[c]] || "left";
      el.contentEditable = "true";
      el.spellcheck = false;
      // Keep cells single-line; richer navigation comes in slice 3.
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.preventDefault();
      });
      return el;
    };

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    header.forEach((cell, c) => htr.appendChild(mkCell("th", cell, c)));
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, c) => tr.appendChild(mkCell("td", cell, c)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Sync only when focus leaves the entire table, not when moving between cells.
    table.addEventListener("focusout", (e) => {
      if (table.contains(e.relatedTarget)) return;
      this.syncToDoc(view, table);
    });

    return table;
  }

  ignoreEvent() {
    return true; // the widget manages its own editing
  }
}

function buildTableDecorations(state) {
  const deco = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const src = state.doc.sliceString(node.from, node.to);
      const model = parseTable(src);
      if (!model) return; // not a well-formed table — leave raw
      deco.push(
        Decoration.replace({
          block: true,
          widget: new TableWidget(src, model),
        }).range(node.from, node.to)
      );
    },
  });
  return Decoration.set(deco, true);
}

export const tableField = StateField.define({
  create: (state) => buildTableDecorations(state),
  update(value, tr) {
    if (tr.docChanged || tr.selection) return buildTableDecorations(tr.state);
    return value.map(tr.changes);
  },
  provide: (f) => [
    EditorView.decorations.from(f),
    // Treat each table as one atomic block for cursor motion.
    EditorView.atomicRanges.of((view) => view.state.field(f) || Decoration.none),
  ],
});
