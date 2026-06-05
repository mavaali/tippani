// Tippani live-preview editor — CodeMirror 6 entry (browser).
// Buffer-is-the-file: the document model IS the markdown text. Decorations render
// formatting inline and reveal markup when the cursor lands on its line.
//
// Bundled at build time into editor.bundle.js (EDITOR_JS string) and inlined into
// the spec page. See docs/plans/2026-06-04-wysiwyg-editor-design.md.

import { EditorState } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  ViewPlugin,
  keymap,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { tableField } from "./table-widget.js";
import { diffLines, diffStats } from "./diff.js";

// --- Live-preview decorations -------------------------------------------------

// Hide a range (the markdown markup) by collapsing it to zero width.
const hideMark = Decoration.replace({});

// True when any cursor/selection touches [from, to] — used to reveal markup on the
// line the user is editing (the Typora trick).
function selectionTouches(state, from, to) {
  for (const r of state.selection.ranges) {
    if (r.from <= to && r.to >= from) return true;
  }
  return false;
}

// Line-level decorations (size headings, style block elements via CSS).
const headingLine = (level) => Decoration.line({ class: `cm-pv-h${level}` });
const lineClass = (cls) => Decoration.line({ class: cls });

// Inline mark decorations.
const mark = (cls) => Decoration.mark({ class: cls });
const strongMark = mark("cm-pv-strong");
const emMark = mark("cm-pv-em");
const strikeMark = mark("cm-pv-strike");
const codeInlineMark = mark("cm-pv-code-inline");
const linkMark = mark("cm-pv-link");
const listMark = mark("cm-pv-listmark");

// Hide a node's marker children (delimiters) when the cursor isn't on it. Walking
// the actual marker nodes is robust to *, _, ** and __ forms and nesting.
function hideChildren(node, names, deco) {
  const n = node.node;
  for (const name of names) {
    for (const c of n.getChildren(name)) {
      if (c.to > c.from) deco.push(hideMark.range(c.from, c.to));
    }
  }
}

// Apply a line class to every line a [from, to] range spans.
function addLineClass(state, from, to, cls, deco) {
  let pos = from;
  for (;;) {
    const line = state.doc.lineAt(pos);
    deco.push(lineClass(cls).range(line.from));
    if (line.to >= to) break;
    pos = line.to + 1;
  }
}

function buildDecorations(view) {
  const deco = [];
  const { state } = view;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const reveal = selectionTouches(state, node.from, node.to);

        // Headings: ATXHeading1..6 — size the line, hide the leading "# " marker
        const headingMatch = /^ATXHeading(\d)$/.exec(node.name);
        if (headingMatch) {
          const level = Number(headingMatch[1]);
          const line = state.doc.lineAt(node.from);
          deco.push(headingLine(level).range(line.from));
          if (!selectionTouches(state, line.from, line.to)) {
            const text = state.doc.sliceString(line.from, line.to);
            const m = /^#{1,6}\s/.exec(text);
            if (m) deco.push(hideMark.range(line.from, line.from + m[0].length));
          }
          return;
        }

        switch (node.name) {
          case "StrongEmphasis":
            deco.push(strongMark.range(node.from, node.to));
            if (!reveal) hideChildren(node, ["EmphasisMark"], deco);
            break;
          case "Emphasis":
            deco.push(emMark.range(node.from, node.to));
            if (!reveal) hideChildren(node, ["EmphasisMark"], deco);
            break;
          case "Strikethrough":
            deco.push(strikeMark.range(node.from, node.to));
            if (!reveal) hideChildren(node, ["StrikethroughMark"], deco);
            break;
          case "InlineCode":
            deco.push(codeInlineMark.range(node.from, node.to));
            if (!reveal) hideChildren(node, ["CodeMark"], deco);
            break;
          case "Link":
            // Keep the link text; hide the [ ] ( ) marks, URL and title off-cursor.
            deco.push(linkMark.range(node.from, node.to));
            if (!reveal) hideChildren(node, ["LinkMark", "URL", "LinkTitle"], deco);
            break;
          case "ListMark":
            deco.push(listMark.range(node.from, node.to));
            break;
          case "Blockquote":
            addLineClass(state, node.from, node.to, "cm-pv-quote", deco);
            break;
          case "QuoteMark": {
            // Per-line reveal — each ">" hides unless the cursor is on its line.
            // (A blockquote's marks aren't all direct children, so handle the mark
            // node directly rather than via the Blockquote node.)
            const qLine = state.doc.lineAt(node.from);
            if (!selectionTouches(state, qLine.from, qLine.to)) {
              const after =
                state.doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0;
              deco.push(hideMark.range(node.from, node.to + after));
            }
            break;
          }
          case "FencedCode": {
            const first = state.doc.lineAt(node.from);
            const last = state.doc.lineAt(node.to);
            if (reveal || first.number >= last.number) {
              // Cursor inside (or degenerate): show fences, style every line.
              for (let n = first.number; n <= last.number; n++) {
                deco.push(lineClass("cm-pv-code").range(state.doc.line(n).from));
              }
            } else {
              // Off-cursor: hide each fence line's text (inline replace — no line
              // break, so it's plugin-legal) and collapse the now-empty line's
              // height via CSS. Interior lines get the code background.
              if (first.to > first.from)
                deco.push(hideMark.range(first.from, first.to));
              deco.push(lineClass("cm-pv-fence").range(first.from));
              for (let n = first.number + 1; n <= last.number - 1; n++) {
                deco.push(lineClass("cm-pv-code").range(state.doc.line(n).from));
              }
              if (last.to > last.from)
                deco.push(hideMark.range(last.from, last.to));
              deco.push(lineClass("cm-pv-fence").range(last.from));
            }
            break;
          }
          case "HorizontalRule": {
            const line = state.doc.lineAt(node.from);
            deco.push(lineClass("cm-pv-hr").range(line.from));
            if (!reveal && line.to > line.from)
              deco.push(hideMark.range(line.from, line.to));
            break;
          }
          default:
            break;
        }
      },
    });
  }
  // sort=true: let CM order by (from, startSide) so line + inline decorations coexist
  return Decoration.set(deco, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(u) {
      // Rebuild on doc change, viewport change, or selection move (reveal-on-cursor)
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// Theme bound to Tippani's CSS variables (inherits dark mode for free).
const tippaniTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--cp-text)" },
  // CM6's base theme forces monospace on .cm-scroller — override so prose inherits
  // the document's sans-serif font.
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.7" },
  ".cm-content": {
    fontFamily: "inherit",
    fontSize: "15px",
    lineHeight: "1.7",
    padding: "0",
    caretColor: "var(--cp-accent)",
  },
  ".cm-cursor": { borderLeftColor: "var(--cp-accent)" },
  "&.cm-focused": { outline: "none" },
  // Headings
  ".cm-pv-h1": { fontSize: "1.8em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-pv-h2": { fontSize: "1.45em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-pv-h3": { fontSize: "1.2em", fontWeight: "600" },
  ".cm-pv-h4": { fontSize: "1.05em", fontWeight: "600" },
  ".cm-pv-h5": { fontWeight: "600" },
  ".cm-pv-h6": { fontWeight: "600", color: "var(--cp-text-muted)" },
  // Inline
  ".cm-pv-strong": { fontWeight: "700" },
  ".cm-pv-em": { fontStyle: "italic" },
  ".cm-pv-strike": { textDecoration: "line-through", color: "var(--cp-text-muted)" },
  ".cm-pv-code-inline": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "0.9em",
    background: "var(--cp-surface-soft)",
    border: "1px solid var(--cp-border)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-pv-link": { color: "var(--cp-link)", textDecoration: "underline" },
  ".cm-pv-listmark": { color: "var(--cp-text-muted)" },
  // Blocks
  ".cm-pv-quote": {
    borderLeft: "3px solid var(--cp-border-strong)",
    paddingLeft: "14px",
    color: "var(--cp-text-muted)",
  },
  ".cm-pv-code": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "0.9em",
    background: "var(--cp-surface-soft)",
  },
  // Collapsed (off-cursor) fence line: empty after hiding its ```; shrink to ~0
  // height so the code block reads as a clean box. Expands when the cursor enters
  // the block (the .cm-pv-fence class is only applied off-cursor).
  ".cm-pv-fence": {
    fontSize: "0",
    lineHeight: "0",
    padding: "0",
    height: "0",
    overflow: "hidden",
  },
  ".cm-pv-hr": {
    borderBottom: "2px solid var(--cp-border)",
    display: "block",
  },
  // Rendered table grid (#45)
  ".cm-pv-table": {
    borderCollapse: "collapse",
    margin: "0",
    fontSize: "0.95em",
    width: "auto",
    minWidth: "max-content",
  },
  ".cm-pv-table th, .cm-pv-table td": {
    border: "1px solid var(--cp-border)",
    padding: "6px 10px",
    minWidth: "88px",
    maxWidth: "280px",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    lineHeight: "1.45",
  },
  ".cm-pv-table th": {
    background: "var(--cp-surface-soft)",
    fontWeight: "600",
  },
  ".cm-pv-table td": { background: "var(--cp-surface)" },
  ".cm-pv-table tr:nth-child(even) td": { background: "var(--cp-surface-soft)" },
  ".cm-pv-table code": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "0.9em",
    background: "var(--cp-surface-soft)",
    border: "1px solid var(--cp-border)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-pv-cell-link": { color: "var(--cp-link)", textDecoration: "underline" },
  ".cm-pv-table th:focus, .cm-pv-table td:focus": {
    outline: "2px solid var(--cp-accent)",
    outlineOffset: "-2px",
    background: "var(--cp-accent-soft)",
  },
  ".cm-pv-table-wrap": {
    position: "relative",
    margin: "12px 0",
    paddingTop: "34px",
    overflowX: "auto",
    maxWidth: "100%",
  },
  // Toolbar hidden until the table has focus.
  ".cm-pv-tbar": {
    display: "none",
    position: "absolute",
    top: "0",
    left: "0",
    gap: "3px",
    background: "var(--cp-surface)",
    border: "1px solid var(--cp-border)",
    borderRadius: "6px",
    padding: "3px",
    zIndex: "20",
  },
  ".cm-pv-table-wrap:focus-within .cm-pv-tbar": { display: "flex" },
  ".cm-pv-tbar button": {
    fontFamily: "inherit",
    fontSize: "11px",
    lineHeight: "1",
    padding: "3px 6px",
    border: "1px solid var(--cp-border)",
    borderRadius: "4px",
    background: "var(--cp-bg)",
    color: "var(--cp-text)",
    cursor: "pointer",
  },
  ".cm-pv-tbar button:hover": { background: "var(--cp-surface-soft)" },
});

// --- Public API ---------------------------------------------------------------

function mount(el, markdownText, opts = {}) {
  const onChange = typeof opts.onChange === "function" ? opts.onChange : null;
  const state = EditorState.create({
    doc: markdownText,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ extensions: GFM }),
      livePreview,
      tableField,
      tippaniTheme,
      EditorView.lineWrapping,
      onChange
        ? EditorView.updateListener.of((u) => {
            if (u.docChanged) onChange(u.state.doc.toString());
          })
        : [],
    ],
  });
  const view = new EditorView({ state, parent: el });
  return {
    view,
    // Read the current markdown buffer (byte-identical to the file when unedited).
    getMarkdown: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}

window.TippaniEditor = { mount, diffLines, diffStats };
