// GFM table block widget (#45). Replaces a pipe-table's source with an editable
// grid. Block decorations span line breaks, so they must come from a StateField.
//
// Editing model:
//  - Cells are contenteditable islands. Plain text edits sync to the document only
//    on focus leaving the whole table, and only when content actually changed — so
//    focusing a non-canonical table without editing never reformats it.
//  - Navigation (Tab / Shift-Tab / Enter / Up / Down) is pure DOM focus movement,
//    no document change.
//  - Structural ops (add/delete row+column, alignment) read the current grid first
//    (capturing pending edits), mutate the model, serialize canonical markdown, and
//    dispatch one transaction; focus is restored to the matching cell afterwards.

import { WidgetType, Decoration, EditorView } from "@codemirror/view";
import { StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { parseTable, serializeTable } from "./table.js";

const ALIGN_CSS = { left: "left", center: "center", right: "right", none: "left" };

function tableRangeAt(state, pos) {
  let node = syntaxTree(state).resolveInner(Math.min(pos + 1, state.doc.length), 1);
  while (node && node.name !== "Table") node = node.parent;
  return node ? { from: node.from, to: node.to } : null;
}

function sameContent(a, b) {
  return (
    JSON.stringify({ h: a.header, r: a.rows, a: a.aligns }) ===
    JSON.stringify({ h: b.header, r: b.rows, a: b.aligns })
  );
}

// All rows as one array: index 0 = header row, 1.. = body rows.
function allRows(table) {
  return [table.querySelector("thead tr"), ...table.querySelectorAll("tbody tr")];
}

function caretToEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

class TableWidget extends WidgetType {
  constructor(src, model) {
    super();
    this.src = src;
    this.model = model;
    this.active = { r: 1, c: 0 }; // last-focused cell (row 0 = header)
  }
  eq(other) {
    return other.src === this.src;
  }

  // Read the grid DOM back into a table model, preserving alignment.
  readModel(table) {
    const header = [...table.querySelectorAll("thead th")].map((th) =>
      th.textContent.trim()
    );
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim())
    );
    return { aligns: this.model.aligns.slice(), header, rows };
  }

  // Write a model to the document as canonical markdown; restore focus to (r, c).
  commit(view, table, model, focus) {
    const md = serializeTable(model);
    const pos = view.posAtDOM(table);
    const range = tableRangeAt(view.state, pos);
    if (!range) return;
    view.dispatch({ changes: { from: range.from, to: range.to, insert: md } });
    if (focus) this.restoreFocus(view, range.from, focus.r, focus.c);
  }

  // After a re-render, find the table that still starts at `from` and focus its
  // (r, c) cell. Runs on a microtask so the new widget DOM exists.
  restoreFocus(view, from, r, c) {
    setTimeout(() => {
      for (const t of view.dom.querySelectorAll(".cm-pv-table")) {
        if (view.posAtDOM(t) !== from) continue;
        const rows = allRows(t);
        const row = rows[Math.max(0, Math.min(r, rows.length - 1))];
        const cell = row && row.children[Math.max(0, Math.min(c, row.children.length - 1))];
        if (cell) {
          cell.focus();
          caretToEnd(cell);
        }
        return;
      }
    }, 0);
  }

  // Sync plain text edits (no structural change) when focus leaves the table.
  syncToDoc(view, table) {
    const next = this.readModel(table);
    if (sameContent(next, this.model)) return;
    this.commit(view, table, next, null);
  }

  // --- structural operations (read current DOM, mutate, commit) ---
  structural(view, table, fn, focus) {
    const model = this.readModel(table);
    fn(model);
    this.commit(view, table, model, focus);
  }
  addRow(view, table) {
    const { r } = this.active;
    this.structural(
      view,
      table,
      (m) => {
        const empty = m.header.map(() => "");
        const insertAt = r === 0 ? 0 : r; // r is 1-based into body
        m.rows.splice(insertAt, 0, empty);
      },
      { r: this.active.r + (this.active.r === 0 ? 1 : 1), c: this.active.c }
    );
  }
  deleteRow(view, table) {
    const { r } = this.active;
    if (r === 0) return; // can't delete the header row
    this.structural(
      view,
      table,
      (m) => {
        if (m.rows.length > 0) m.rows.splice(r - 1, 1);
      },
      { r: Math.max(1, r), c: this.active.c }
    );
  }
  addCol(view, table) {
    const { c } = this.active;
    this.structural(
      view,
      table,
      (m) => {
        const at = c + 1;
        m.header.splice(at, 0, "");
        m.aligns.splice(at, 0, "none");
        m.rows.forEach((row) => row.splice(at, 0, ""));
      },
      { r: this.active.r, c: c + 1 }
    );
  }
  deleteCol(view, table) {
    const { c } = this.active;
    this.structural(
      view,
      table,
      (m) => {
        if (m.header.length <= 1) return; // keep at least one column
        m.header.splice(c, 1);
        m.aligns.splice(c, 1);
        m.rows.forEach((row) => row.splice(c, 1));
      },
      { r: this.active.r, c: Math.max(0, c - 1) }
    );
  }
  setAlign(view, table, align) {
    const { c } = this.active;
    this.structural(
      view,
      table,
      (m) => {
        m.aligns[c] = align;
      },
      { r: this.active.r, c }
    );
  }

  // --- navigation (pure DOM focus, no document change) ---
  navigate(view, table, cell, key, shift) {
    const rows = allRows(table);
    let r = -1,
      c = -1;
    for (let i = 0; i < rows.length; i++) {
      const idx = [...rows[i].children].indexOf(cell);
      if (idx >= 0) {
        r = i;
        c = idx;
        break;
      }
    }
    if (r < 0) return false;
    const cols = rows[0].children.length;
    const focusCell = (nr, nc) => {
      const row = rows[nr];
      const target = row && row.children[nc];
      if (target) {
        target.focus();
        caretToEnd(target);
      }
    };
    if (key === "Tab" && !shift) {
      if (c + 1 < cols) focusCell(r, c + 1);
      else if (r + 1 < rows.length) focusCell(r + 1, 0);
      else this.addRow(view, table); // Tab past the last cell adds a row
      return true;
    }
    if (key === "Tab" && shift) {
      if (c > 0) focusCell(r, c - 1);
      else if (r > 0) focusCell(r - 1, cols - 1);
      return true;
    }
    if (key === "ArrowDown" || key === "Enter") {
      if (r + 1 < rows.length) focusCell(r + 1, c);
      else if (key === "Enter") this.addRow(view, table);
      return true;
    }
    if (key === "ArrowUp") {
      if (r > 0) focusCell(r - 1, c);
      return true;
    }
    return false;
  }

  toDOM(view) {
    const { aligns, header, rows } = this.model;
    const wrap = document.createElement("div");
    wrap.className = "cm-pv-table-wrap";

    const table = document.createElement("table");
    table.className = "cm-pv-table";

    const setActiveFromCell = (cell) => {
      const rs = allRows(table);
      for (let i = 0; i < rs.length; i++) {
        const idx = [...rs[i].children].indexOf(cell);
        if (idx >= 0) {
          this.active = { r: i, c: idx };
          return;
        }
      }
    };

    const mkCell = (tag, text, c) => {
      const el = document.createElement(tag);
      el.textContent = text;
      el.style.textAlign = ALIGN_CSS[aligns[c]] || "left";
      el.contentEditable = "true";
      el.spellcheck = false;
      el.addEventListener("focus", () => setActiveFromCell(el));
      el.addEventListener("keydown", (e) => {
        if (
          e.key === "Tab" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "Enter"
        ) {
          // Enter/arrows could be mid-text; only navigate for Tab and Enter, and
          // for arrows when the caret is at a text boundary would be ideal — but
          // single-line cells make plain row movement the sensible default.
          if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown") {
            if (this.navigate(view, table, el, e.key, e.shiftKey)) e.preventDefault();
          }
        }
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

    // Toolbar — shown via CSS :focus-within. Buttons use mousedown+preventDefault
    // so they act without first blurring the active cell.
    const bar = document.createElement("div");
    bar.className = "cm-pv-tbar";
    const btn = (label, title, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.tabIndex = -1;
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        fn();
      });
      return b;
    };
    bar.appendChild(btn("+Row", "Add row below", () => this.addRow(view, table)));
    bar.appendChild(btn("−Row", "Delete current row", () => this.deleteRow(view, table)));
    bar.appendChild(btn("+Col", "Add column after", () => this.addCol(view, table)));
    bar.appendChild(btn("−Col", "Delete current column", () => this.deleteCol(view, table)));
    bar.appendChild(btn("L", "Align column left", () => this.setAlign(view, table, "left")));
    bar.appendChild(btn("C", "Align column center", () => this.setAlign(view, table, "center")));
    bar.appendChild(btn("R", "Align column right", () => this.setAlign(view, table, "right")));

    wrap.appendChild(bar);
    wrap.appendChild(table);

    // Sync plain edits when focus leaves the whole wrapper.
    wrap.addEventListener("focusout", (e) => {
      if (wrap.contains(e.relatedTarget)) return;
      this.syncToDoc(view, table);
    });

    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function buildTableDecorations(state) {
  const deco = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const src = state.doc.sliceString(node.from, node.to);
      const model = parseTable(src);
      if (!model) return;
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
    EditorView.atomicRanges.of((view) => view.state.field(f) || Decoration.none),
  ],
});
