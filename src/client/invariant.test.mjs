// Byte-identical round-trip invariant (#46): the live-preview editor must never
// mutate the buffer on load. Mounts the REAL editor bundle in jsdom for each
// fixture and asserts getMarkdown() === the file, both on load and after a
// selection change (which rebuilds decorations). Run: npm run test:invariant.
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EDITOR_JS } from "./editor.bundle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, "fixtures");

const dom = new JSDOM("<!DOCTYPE html><body></body>", {
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.eval(EDITOR_JS);

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

const files = fs.readdirSync(FIX_DIR).filter((f) => f.endsWith(".md")).sort();
check("found 5+ fixtures", files.length >= 5);

for (const file of files) {
  const content = fs.readFileSync(path.join(FIX_DIR, file), "utf8");
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const ed = window.TippaniEditor.mount(host, content, {});

  check(`${file}: byte-identical on load`, ed.getMarkdown() === content);

  // Move the cursor into the middle — rebuilds live-preview + table decorations.
  const mid = Math.floor(content.length / 2);
  ed.view.dispatch({ selection: { anchor: mid } });
  check(`${file}: byte-identical after selection change`, ed.getMarkdown() === content);

  ed.destroy();
  host.remove();
}

console.log(`\ninvariant.test: ${pass} passed, ${fail} failed (${files.length} fixtures)`);
process.exit(fail ? 1 : 0);
