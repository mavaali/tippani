// Tippani formatting commands — pure CM6 StateCommands for the toolbar and keybindings.
// Each function takes an EditorView and dispatches a single transaction. Grouped by shape:
//   1. Inline wrap (bold, italic, strikethrough, inline code)
//   2. Line prefix (headings, lists, blockquote)
//   3. Block fence (code block)
//   4. Insert (link, image, horizontal rule)
//
// Re-exports indentMore/indentLess from @codemirror/commands for toolbar wiring.

import { indentMore, indentLess } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
export { indentMore, indentLess };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Check if the text immediately surrounding the selection matches a marker pair.
// Returns { from, to } of the outer markers if found, null otherwise.
function findInlineMarker(state, marker) {
  const { from, to } = state.selection.main;
  const mLen = marker.length;
  // Need at least marker+marker around the selection.
  if (from < mLen || to + mLen > state.doc.length) return null;
  const before = state.doc.sliceString(from - mLen, from);
  const after = state.doc.sliceString(to, to + mLen);
  if (before === marker && after === marker) {
    return { from: from - mLen, to: to + mLen };
  }
  return null;
}

// Check if the cursor (collapsed selection) is inside an inline-marked node by
// walking the syntax tree. Returns the node range if found.
function findNodeAtCursor(state, nodeType) {
  const pos = state.selection.main.head;
  let found = null;
  syntaxTree(state).iterate({
    from: pos,
    to: pos,
    enter(node) {
      if (node.name === nodeType) {
        found = { from: node.from, to: node.to };
      }
    },
  });
  return found;
}

// Get the line prefix (leading #, -, 1., - [ ], >) for a given line.
function getLinePrefix(lineText) {
  const m = lineText.match(
    /^(\s*)(#{1,6}\s|[-*+]\s\[[ x]\]\s|[-*+]\s|\d+\.\s|>\s?)/
  );
  if (!m) return { indent: "", prefix: "", rest: lineText };
  return { indent: m[1], prefix: m[2], rest: lineText.slice(m[0].length) };
}

// ---------------------------------------------------------------------------
// 1. Inline wrap commands
// ---------------------------------------------------------------------------

function makeInlineToggle(marker, nodeType) {
  return function (view) {
    const { state } = view;
    const { from, to } = state.selection.main;
    const mLen = marker.length;

    // Case A: Non-empty selection — check for existing markers around selection.
    if (from !== to) {
      const existing = findInlineMarker(state, marker);
      if (existing) {
        // Unwrap: remove markers, keep selection on the inner text.
        view.dispatch({
          changes: [
            { from: existing.from, to: existing.from + mLen },
            { from: existing.to - mLen, to: existing.to },
          ],
          selection: { anchor: existing.from, head: existing.to - mLen * 2 },
        });
      } else {
        // Wrap: add markers around selection.
        const text = state.doc.sliceString(from, to);
        view.dispatch({
          changes: { from, to, insert: marker + text + marker },
          selection: { anchor: from + mLen, head: from + mLen + text.length },
        });
      }
      return true;
    }

    // Case B: Collapsed cursor — check if inside a marked node via syntax tree.
    const node = findNodeAtCursor(state, nodeType);
    if (node) {
      // Unwrap the entire node by stripping its markers.
      const inner = state.doc.sliceString(node.from + mLen, node.to - mLen);
      view.dispatch({
        changes: { from: node.from, to: node.to, insert: inner },
        selection: { anchor: node.from + (from - node.from - mLen) },
      });
      return true;
    }

    // Insert paired markers with cursor between.
    view.dispatch({
      changes: { from, insert: marker + marker },
      selection: { anchor: from + mLen },
    });
    return true;
  };
}

export const toggleBold = makeInlineToggle("**", "StrongEmphasis");
export const toggleItalic = makeInlineToggle("*", "Emphasis");
export const toggleStrikethrough = makeInlineToggle("~~", "Strikethrough");
export const toggleInlineCode = makeInlineToggle("`", "InlineCode");

// ---------------------------------------------------------------------------
// 2. Line prefix commands
// ---------------------------------------------------------------------------

// Set heading level (0 = paragraph, 1–4). Replaces any existing heading prefix.
export function setHeading(level) {
  return function (view) {
    const { state } = view;
    const { from } = state.selection.main;
    const line = state.doc.lineAt(from);
    const text = line.text;
    // Strip existing heading prefix.
    const stripped = text.replace(/^#{1,6}\s?/, "");
    const newPrefix = level > 0 ? "#".repeat(level) + " " : "";
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: newPrefix + stripped },
      selection: { anchor: line.from + newPrefix.length + (from - line.from - (text.length - stripped.length)) },
    });
    return true;
  };
}

function makeListToggle(prefixPattern, newPrefix) {
  return function (view) {
    const { state } = view;
    const { from, to } = state.selection.main;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    const changes = [];
    let selOffset = 0;

    for (let n = startLine.number; n <= endLine.number; n++) {
      const line = state.doc.line(n);
      const { indent, prefix, rest } = getLinePrefix(line.text);

      if (prefixPattern.test(prefix)) {
        // Remove the prefix (toggle off).
        changes.push({ from: line.from, to: line.to, insert: indent + rest });
        if (n === startLine.number) selOffset = -(prefix.length);
      } else {
        // Strip any other list prefix first, then apply ours.
        const clean = indent + rest;
        const insertion = indent + newPrefix + rest;
        changes.push({ from: line.from, to: line.to, insert: insertion });
        if (n === startLine.number) {
          selOffset = newPrefix.length - prefix.length;
        }
      }
    }

    view.dispatch({
      changes,
      selection: { anchor: Math.max(startLine.from, from + selOffset) },
    });
    return true;
  };
}

export const toggleBulletList = makeListToggle(/^[-*+]\s$/, "- ");
export const toggleOrderedList = makeListToggle(/^\d+\.\s$/, "1. ");
export const toggleTaskList = makeListToggle(/^[-*+]\s\[[ x]\]\s$/, "- [ ] ");

export function toggleBlockquote(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(to);
  const changes = [];
  // Check first line to decide toggle direction.
  const removing = /^>\s?/.test(startLine.text);

  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = state.doc.line(n);
    if (removing) {
      const m = line.text.match(/^>\s?/);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length });
    } else {
      changes.push({ from: line.from, insert: "> " });
    }
  }

  view.dispatch({ changes });
  return true;
}

// ---------------------------------------------------------------------------
// 3. Block fence command
// ---------------------------------------------------------------------------

export function toggleCodeBlock(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(to);

  // Check if we're inside a FencedCode node.
  let insideFence = null;
  syntaxTree(state).iterate({
    from: startLine.from,
    to: endLine.to,
    enter(node) {
      if (node.name === "FencedCode") {
        insideFence = { from: node.from, to: node.to };
      }
    },
  });

  if (insideFence) {
    // Unwrap: remove the opening and closing fence lines.
    const fenceStart = state.doc.lineAt(insideFence.from);
    const fenceEnd = state.doc.lineAt(insideFence.to);
    // Remove closing fence line (including preceding newline).
    // Remove opening fence line (including trailing newline).
    const changes = [];
    if (fenceEnd.from > fenceStart.to) {
      changes.push({ from: fenceEnd.from - 1, to: fenceEnd.to });
    }
    changes.push({ from: fenceStart.from, to: fenceStart.to + 1 });
    view.dispatch({ changes });
    return true;
  }

  // Wrap selection in fences.
  const selectedText = state.doc.sliceString(from, to);
  const needsLeadingNewline = from !== startLine.from;
  const prefix = needsLeadingNewline ? "\n```\n" : "```\n";
  const needsTrailingNewline = to !== endLine.to;
  const suffix = needsTrailingNewline ? "\n```\n" : "\n```";

  if (from === to) {
    // Empty selection: insert fences with cursor on the empty line between.
    view.dispatch({
      changes: { from, insert: "```\n\n```" },
      selection: { anchor: from + 4 },
    });
  } else {
    view.dispatch({
      changes: { from, to, insert: prefix + selectedText + suffix },
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// 4. Insert commands
// ---------------------------------------------------------------------------

export function insertLink(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const selectedText = from !== to ? state.doc.sliceString(from, to) : "text";
  const insert = `[${selectedText}](url)`;
  // Place cursor on "url" for easy replacement. Offset: [ + text + ]( = 3.
  const urlStart = from + selectedText.length + 3;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  });
  return true;
}

export function insertImage(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const alt = from !== to ? state.doc.sliceString(from, to) : "alt";
  const insert = `![${alt}](url)`;
  // Offset: ![ + alt + ]( = 4.
  const urlStart = from + alt.length + 4;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  });
  return true;
}

export function insertHorizontalRule(view) {
  const { state } = view;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  if (from === line.from && line.text === "") {
    // Empty line: replace it with the rule.
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: "---" },
      selection: { anchor: line.from + 3 },
    });
  } else {
    // Mid-line: insert rule on a new line after cursor.
    const insert = "\n---\n";
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + insert.length },
    });
  }
  return true;
}
