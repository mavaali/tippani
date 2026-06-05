// Unit tests for editor-commands.js (run: npm run test:commands).
// Uses EditorState + EditorView from CM6 — no DOM needed for state tests,
// but EditorView is required because commands call view.dispatch().
//
// Test pattern matches the existing table.test.mjs / diff.test.mjs style.

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  setHeading,
  toggleBulletList,
  toggleOrderedList,
  toggleTaskList,
  toggleBlockquote,
  toggleCodeBlock,
  insertLink,
  insertImage,
  insertHorizontalRule,
} from "./editor-commands.js";

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

// Create a minimal EditorView for testing. CM6 requires a DOM parent for
// EditorView, but in Node we can use a detached element via jsdom — however,
// the repo doesn't use jsdom. Instead, we use a minimal shim: EditorView
// accepts { state, parent } where parent can be any element. In Node 18+
// with --experimental-vm-modules we'd need jsdom. Since the existing tests
// don't use it, we create a view with dispatch capture instead.
//
// Approach: create EditorState, create EditorView with a root: { document }
// shim. CM6 actually works in Node if we provide a minimal document shim.

// Minimal DOM shim for CM6 EditorView in Node.
function createDOMShim() {
  const el = {
    nodeType: 1,
    nodeName: "DIV",
    tagName: "DIV",
    className: "",
    style: {},
    dataset: {},
    childNodes: [],
    children: [],
    firstChild: null,
    lastChild: null,
    parentNode: null,
    ownerDocument: null,
    textContent: "",
    innerHTML: "",
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    hasAttribute() { return false; },
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) { this.childNodes.push(c); this.firstChild = this.childNodes[0]; this.lastChild = c; c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); return c; },
    insertBefore(c, ref) { this.childNodes.push(c); c.parentNode = this; return c; },
    replaceChild(n, o) { return n; },
    contains() { return true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    getClientRects() { return []; },
    cloneNode() { return createDOMShim(); },
    compareDocumentPosition() { return 0; },
    getRootNode() { return this; },
    scrollIntoView() {},
    focus() {},
    blur() {},
    dispatchEvent() { return true; },
  };
  el.ownerDocument = el;
  return el;
}

// Since EditorView needs real DOM in practice, we test commands via
// state-only approach: create the state, run the command logic against
// a mock view that captures dispatch calls.
function makeTestView(doc, selFrom, selTo) {
  if (selTo === undefined) selTo = selFrom;
  const state = EditorState.create({
    doc,
    selection: { anchor: selFrom, head: selTo },
    extensions: [markdown({ extensions: GFM })],
  });
  // Ensure syntax tree is available synchronously.
  // Force a full parse so syntaxTree() returns complete data.
  // (CM6 markdown parser is synchronous for small docs.)

  let resultState = state;
  const view = {
    state,
    dispatch(tr) {
      if (typeof tr === "object" && !Array.isArray(tr)) {
        resultState = state.update(tr).state;
        view.state = resultState;
      }
    },
  };
  return {
    view,
    getDoc: () => resultState.doc.toString(),
    getSel: () => {
      const sel = resultState.selection.main;
      return { from: sel.from, to: sel.to };
    },
  };
}

// ===========================================================================
// 1. Inline wrap — toggleBold
// ===========================================================================

console.log("--- toggleBold ---");

// Wrap selected text.
{
  const t = makeTestView("hello world", 6, 11); // select "world"
  toggleBold(t.view);
  eq("bold wrap selection", t.getDoc(), "hello **world**");
}

// Unwrap selected text (markers present around selection).
{
  const t = makeTestView("hello **world**", 8, 13); // select "world" inside **
  toggleBold(t.view);
  eq("bold unwrap selection", t.getDoc(), "hello world");
}

// Empty selection — insert markers.
{
  const t = makeTestView("hello world", 5); // cursor after "hello"
  toggleBold(t.view);
  eq("bold insert empty", t.getDoc(), "hello**** world");
  eq("bold cursor between", t.getSel().from, 7);
}

// ===========================================================================
// 2. Inline wrap — toggleItalic
// ===========================================================================

console.log("--- toggleItalic ---");

{
  const t = makeTestView("some text", 5, 9); // select "text"
  toggleItalic(t.view);
  eq("italic wrap", t.getDoc(), "some *text*");
}

// ===========================================================================
// 3. Inline wrap — toggleStrikethrough
// ===========================================================================

console.log("--- toggleStrikethrough ---");

{
  const t = makeTestView("old text", 0, 3); // select "old"
  toggleStrikethrough(t.view);
  eq("strike wrap", t.getDoc(), "~~old~~ text");
}

// ===========================================================================
// 4. Inline wrap — toggleInlineCode
// ===========================================================================

console.log("--- toggleInlineCode ---");

{
  const t = makeTestView("call foo() now", 5, 10); // select "foo()"
  toggleInlineCode(t.view);
  eq("code wrap", t.getDoc(), "call `foo()` now");
}

// ===========================================================================
// 5. Line prefix — setHeading
// ===========================================================================

console.log("--- setHeading ---");

// Set H2 on plain line.
{
  const t = makeTestView("Introduction", 5);
  setHeading(2)(t.view);
  eq("set h2", t.getDoc(), "## Introduction");
}

// Change H1 to H3.
{
  const t = makeTestView("# Title", 3);
  setHeading(3)(t.view);
  eq("h1 to h3", t.getDoc(), "### Title");
}

// Remove heading (set to paragraph).
{
  const t = makeTestView("## Section", 4);
  setHeading(0)(t.view);
  eq("h2 to para", t.getDoc(), "Section");
}

// ===========================================================================
// 6. Line prefix — toggleBulletList
// ===========================================================================

console.log("--- toggleBulletList ---");

// Add bullet.
{
  const t = makeTestView("item one", 3);
  toggleBulletList(t.view);
  eq("add bullet", t.getDoc(), "- item one");
}

// Remove bullet.
{
  const t = makeTestView("- item one", 5);
  toggleBulletList(t.view);
  eq("remove bullet", t.getDoc(), "item one");
}

// ===========================================================================
// 7. Line prefix — toggleOrderedList
// ===========================================================================

console.log("--- toggleOrderedList ---");

{
  const t = makeTestView("first item", 0);
  toggleOrderedList(t.view);
  eq("add ordered", t.getDoc(), "1. first item");
}

{
  const t = makeTestView("1. first item", 5);
  toggleOrderedList(t.view);
  eq("remove ordered", t.getDoc(), "first item");
}

// ===========================================================================
// 8. Line prefix — toggleTaskList
// ===========================================================================

console.log("--- toggleTaskList ---");

{
  const t = makeTestView("do thing", 3);
  toggleTaskList(t.view);
  eq("add task", t.getDoc(), "- [ ] do thing");
}

{
  const t = makeTestView("- [ ] do thing", 8);
  toggleTaskList(t.view);
  eq("remove task", t.getDoc(), "do thing");
}

// ===========================================================================
// 9. Line prefix — toggleBlockquote
// ===========================================================================

console.log("--- toggleBlockquote ---");

{
  const t = makeTestView("wise words", 3);
  toggleBlockquote(t.view);
  eq("add quote", t.getDoc(), "> wise words");
}

{
  const t = makeTestView("> wise words", 5);
  toggleBlockquote(t.view);
  eq("remove quote", t.getDoc(), "wise words");
}

// Multi-line blockquote.
{
  const t = makeTestView("line one\nline two", 0, 17);
  toggleBlockquote(t.view);
  eq("add quote multi", t.getDoc(), "> line one\n> line two");
}

// ===========================================================================
// 10. Block fence — toggleCodeBlock
// ===========================================================================

console.log("--- toggleCodeBlock ---");

// Wrap selection in fences.
{
  const t = makeTestView("const x = 1;", 0, 12);
  toggleCodeBlock(t.view);
  eq("add fence", t.getDoc(), "```\nconst x = 1;\n```");
}

// Empty selection — insert empty fenced block.
{
  const t = makeTestView("hello", 5);
  toggleCodeBlock(t.view);
  eq("insert empty fence", t.getDoc(), "hello```\n\n```");
  eq("cursor in fence", t.getSel().from, 9);
}

// ===========================================================================
// 11. Insert — insertLink
// ===========================================================================

console.log("--- insertLink ---");

// With selected text → use as link text.
{
  const t = makeTestView("click here please", 6, 10); // select "here"
  insertLink(t.view);
  eq("link with selection", t.getDoc(), "click [here](url) please");
  // Cursor should select "url".
  eq("link url selected", t.getSel(), { from: 13, to: 16 });
}

// Empty selection → insert placeholder.
{
  const t = makeTestView("go to ", 6);
  insertLink(t.view);
  eq("link empty", t.getDoc(), "go to [text](url)");
}

// ===========================================================================
// 12. Insert — insertImage
// ===========================================================================

console.log("--- insertImage ---");

{
  const t = makeTestView("see ", 4);
  insertImage(t.view);
  eq("image empty", t.getDoc(), "see ![alt](url)");
  eq("image url selected", t.getSel(), { from: 11, to: 14 });
}

// ===========================================================================
// 13. Insert — insertHorizontalRule
// ===========================================================================

console.log("--- insertHorizontalRule ---");

// On empty line.
{
  const t = makeTestView("above\n\nbelow", 6); // cursor on empty line
  insertHorizontalRule(t.view);
  eq("hr on empty", t.getDoc(), "above\n---\nbelow");
}

// Mid-line — inserts rule on new line after cursor.
{
  const t = makeTestView("some text", 4);
  insertHorizontalRule(t.view);
  eq("hr mid-line", t.getDoc(), "some\n---\n text");
}

// ===========================================================================

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
