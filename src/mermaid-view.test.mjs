// Phase 119: tests for client-side Mermaid rendering.
//   - pure helpers (mermaidThemeName, claimMermaidBlocks) under jsdom
//   - initMermaidView render + theme + error-fallback with a mocked runtime
//   - the official mermaid runtime is embedded offline (mermaid.bundle.js)
//   - index.js wires the vendor route + inlines the view bundle
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mermaidThemeName, claimMermaidBlocks, initMermaidView } from "./client/mermaid-view.js";
import { MERMAID_JS } from "./client/mermaid.bundle.js";
import { MERMAID_VIEW_JS } from "./client/mermaid-view.bundle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

function makeDom(bodyHtml, theme) {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body>" + bodyHtml + "</body></html>");
  // Force a settled document so initMermaidView renders synchronously (jsdom may
  // otherwise report readyState 'loading' and defer to DOMContentLoaded).
  Object.defineProperty(dom.window.document, "readyState", { value: "complete", configurable: true });
  if (theme) dom.window.document.documentElement.dataset.theme = theme;
  return dom;
}

function mockMermaid(behavior) {
  const calls = { init: [], render: [] };
  const m = {
    initialize(opts) { calls.init.push(opts); },
    render(id, src) {
      calls.render.push({ id, src });
      if (behavior === "reject") return Promise.reject(new Error("bad diagram"));
      return Promise.resolve({ svg: '<svg class="mmd-svg" data-src="' + src + '"></svg>' });
    },
  };
  return { m, calls };
}

try {
  // mermaidThemeName
  {
    const dark = makeDom("", "dark");
    const light = makeDom("", "light");
    const none = makeDom("");
    check("theme dark", mermaidThemeName(dark.window.document) === "dark");
    check("theme light → default", mermaidThemeName(light.window.document) === "default");
    check("theme absent → default", mermaidThemeName(none.window.document) === "default");
  }

  // claimMermaidBlocks
  {
    const dom = makeDom(
      '<div id="spec-content">' +
        '<pre><code class="language-mermaid">graph LR\n  A --> B</code></pre>' +
        '<pre><code class="language-js">const x = 1;</code></pre>' +
        '<pre><code class="language-mermaid">sequenceDiagram</code></pre>' +
      "</div>"
    );
    const doc = dom.window.document;
    const hosts = claimMermaidBlocks(doc.getElementById("spec-content"), doc);
    check("claims two mermaid blocks", hosts.length === 2);
    check("host is div.mermaid-block", hosts[0].tagName === "DIV" && hosts[0].className === "mermaid-block");
    check("source captured", hosts[0].getAttribute("data-mermaid-src") === "graph LR\n  A --> B");
    check("second source captured", hosts[1].getAttribute("data-mermaid-src") === "sequenceDiagram");
    check("non-mermaid code untouched", doc.querySelectorAll("code.language-js").length === 1);
    check("mermaid pre elements removed", doc.querySelectorAll("pre > code.language-mermaid").length === 0);
    check("hosts are in the DOM", doc.querySelectorAll(".mermaid-block").length === 2);
  }

  // claimMermaidBlocks safe on empty / no blocks
  {
    const dom = makeDom('<div id="x"><p>no diagrams</p></div>');
    const doc = dom.window.document;
    check("no blocks → empty array", claimMermaidBlocks(doc.getElementById("x"), doc).length === 0);
  }

  // initMermaidView renders with a mocked runtime, honoring theme + strict security
  {
    const dom = makeDom(
      '<div id="spec-content"><pre><code class="language-mermaid">graph TD\n X --> Y</code></pre></div>',
      "dark"
    );
    const win = dom.window;
    const { m, calls } = mockMermaid("resolve");
    win.mermaid = m; // pre-set so loadMermaid resolves without a network script
    await initMermaidView(win);
    const host = win.document.querySelector(".mermaid-block");
    check("initMermaidView installs render hook", typeof win.tippaniRenderMermaid === "function");
    check("initMermaidView installs rerender hook", typeof win.tippaniRerenderMermaid === "function");
    check("mermaid.initialize called once", calls.init.length === 1);
    check("securityLevel strict", calls.init[0] && calls.init[0].securityLevel === "strict");
    check("startOnLoad false", calls.init[0] && calls.init[0].startOnLoad === false);
    check("theme threaded from data-theme", calls.init[0] && calls.init[0].theme === "dark");
    check("render called with source", calls.render.length === 1 && calls.render[0].src === "graph TD\n X --> Y");
    check("svg injected into host", !!host && /mmd-svg/.test(host.innerHTML));
    check("host not in error state", !!host && !host.classList.contains("mermaid-error"));
  }

  // initMermaidView error path falls back to raw fenced source + note
  {
    const dom = makeDom(
      '<div id="spec-content"><pre><code class="language-mermaid">graph TD\n bad</code></pre></div>'
    );
    const win = dom.window;
    const { m } = mockMermaid("reject");
    win.mermaid = m;
    await initMermaidView(win);
    const host = win.document.querySelector(".mermaid-block");
    check("error host flagged", !!host && host.classList.contains("mermaid-error"));
    check("error note shown", !!host && !!host.querySelector(".mermaid-error-note"));
    check("raw source preserved on error", !!host && host.querySelector("pre > code.language-mermaid") &&
      host.querySelector("pre > code.language-mermaid").textContent === "graph TD\n bad");
  }

  // rerenderAll re-initializes with the current theme (theme-change path)
  {
    const dom = makeDom(
      '<div id="spec-content"><pre><code class="language-mermaid">graph LR\n A --> B</code></pre></div>',
      "light"
    );
    const win = dom.window;
    const { m, calls } = mockMermaid("resolve");
    win.mermaid = m;
    await initMermaidView(win);
    check("initial theme default (light)", calls.init[0].theme === "default");
    win.document.documentElement.dataset.theme = "dark";
    win.tippaniRerenderMermaid();
    await Promise.resolve();
    check("rerender re-initialized", calls.init.length === 2);
    check("rerender picked up dark theme", calls.init[1].theme === "dark");
  }

  // Offline: the official mermaid runtime is embedded (not a CDN dependency)
  {
    check("MERMAID_JS is a large string", typeof MERMAID_JS === "string" && MERMAID_JS.length > 1_000_000);
    check("MERMAID_JS exposes the mermaid global", MERMAID_JS.includes('globalThis["mermaid"]'));
    check("MERMAID_VIEW_JS self-inits", MERMAID_VIEW_JS.includes("initMermaidView") && MERMAID_VIEW_JS.includes("tippaniRenderMermaid"));
  }

  // index.js wires the vendor route, embed import, and view inline
  {
    const idx = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
    check("imports MERMAID_JS", idx.includes('import { MERMAID_JS } from "./client/mermaid.bundle.js"'));
    check("imports MERMAID_VIEW_JS", idx.includes('import { MERMAID_VIEW_JS } from "./client/mermaid-view.bundle.js"'));
    check("serves /vendor/mermaid.min.js", idx.includes('app.get("/vendor/mermaid.min.js"'));
    check("inlines the view bundle", idx.includes("<script>${MERMAID_VIEW_JS}</script>"));
    check("applyView re-renders proposed diagrams", idx.includes("await window.tippaniRenderMermaid(rendered)"));
    check("mermaid-block CSS present", idx.includes(".mermaid-block"));
  }
} catch (e) {
  fail++;
  console.error("UNEXPECTED THROW:", e && e.stack);
} finally {
  console.log(`\nmermaid-view.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
