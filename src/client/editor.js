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
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

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

// Line-level class for headings so we can size them via CSS.
const headingLine = (level) =>
  Decoration.line({ class: `cm-pv-h${level}` });
const strongMark = Decoration.mark({ class: "cm-pv-strong" });

function buildDecorations(view) {
  const deco = [];
  const { state } = view;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        // Headings: ATXHeading1..6 — size the line, hide the leading "# " marker
        const headingMatch = /^ATXHeading(\d)$/.exec(node.name);
        if (headingMatch) {
          const level = Number(headingMatch[1]);
          const line = state.doc.lineAt(node.from);
          deco.push(headingLine(level).range(line.from));
          if (!selectionTouches(state, line.from, line.to)) {
            // hide "#"* and the following space
            const text = state.doc.sliceString(line.from, line.to);
            const m = /^#{1,6}\s/.exec(text);
            if (m) deco.push(hideMark.range(line.from, line.from + m[0].length));
          }
          return;
        }
        // Strong (**bold**): style inner text, hide the ** delimiters off-cursor
        if (node.name === "StrongEmphasis") {
          const reveal = selectionTouches(state, node.from, node.to);
          deco.push(strongMark.range(node.from + 2, node.to - 2));
          if (!reveal) {
            deco.push(hideMark.range(node.from, node.from + 2));
            deco.push(hideMark.range(node.to - 2, node.to));
          }
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
  ".cm-content": {
    fontFamily: "inherit",
    fontSize: "15px",
    lineHeight: "1.7",
    padding: "0",
    caretColor: "var(--cp-accent)",
  },
  ".cm-cursor": { borderLeftColor: "var(--cp-accent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-pv-h1": { fontSize: "1.8em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-pv-h2": { fontSize: "1.45em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-pv-h3": { fontSize: "1.2em", fontWeight: "600" },
  ".cm-pv-h4": { fontSize: "1.05em", fontWeight: "600" },
  ".cm-pv-h5": { fontWeight: "600" },
  ".cm-pv-h6": { fontWeight: "600", color: "var(--cp-text-muted)" },
  ".cm-pv-strong": { fontWeight: "700" },
});

// --- Public API ---------------------------------------------------------------

function mount(el, markdownText, opts = {}) {
  const onChange = typeof opts.onChange === "function" ? opts.onChange : null;
  const state = EditorState.create({
    doc: markdownText,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      livePreview,
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

window.TippaniEditor = { mount };
