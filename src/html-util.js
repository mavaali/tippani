// Shared server-side HTML/render helpers, extracted from index.js so the page
// builders can import one copy instead of reaching into a 5k-line module: the
// design-token CSS block, the ADO change-type badge, HTML escaping, and a
// markdown-to-plaintext stripper. All pure and dependency-free.

export function cssVariables() {
  return `
:root {
  color-scheme: light;
  --cp-bg: #f7f4ef;
  --cp-bg-elevated: #fcfbf8;
  --cp-surface: #ffffff;
  --cp-surface-soft: #f5f5f5;
  --cp-border: #dedede;
  --cp-border-strong: #919191;
  --cp-text: #242424;
  --cp-text-muted: #5c5c5c;
  --cp-text-soft: #6f6f6f;
  --cp-accent: #b11f4b;
  --cp-accent-hover: #9a1a41;
  --cp-accent-soft: rgba(177, 31, 75, 0.08);
  --cp-accent-fg: #ffffff;
  --cp-success: #16a34a;
  --cp-danger: #dc2626;
  --cp-warning: #f59e0b;
  --cp-link: #0078d4;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
  --cp-overlay: rgba(255, 255, 255, 0.8);
  --cp-panel: rgba(255, 255, 255, 0.86);
  --cp-panel-strong: rgba(255, 255, 255, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.55);
  --cp-highlight: rgba(177, 31, 75, 0.12);
  --cp-code-bg: #1e1e1e;
  --cp-code-fg: #d4d4d4;
}
html[data-theme="dark"] {
  color-scheme: dark;
  --cp-bg: #3d3b3a;
  --cp-bg-elevated: #343231;
  --cp-surface: #292929;
  --cp-surface-soft: #2e2e2e;
  --cp-border: #474747;
  --cp-border-strong: #5f5f5f;
  --cp-text: #dedede;
  --cp-text-muted: #919191;
  --cp-text-soft: #b0b0b0;
  --cp-accent: #fd8ea1;
  --cp-accent-hover: #fb7b91;
  --cp-accent-soft: rgba(253, 142, 161, 0.14);
  --cp-accent-fg: #1a1a1a;
  --cp-success: #4ade80;
  --cp-danger: #f87171;
  --cp-warning: #fbbf24;
  --cp-link: #4da6ff;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  --cp-overlay: rgba(41, 41, 41, 0.88);
  --cp-panel: rgba(41, 41, 41, 0.72);
  --cp-panel-strong: rgba(41, 41, 41, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.04);
  --cp-highlight: rgba(253, 142, 161, 0.12);
  --cp-code-bg: #1b1b1b;
  --cp-code-fg: #d4d4d4;
}`;
}

export function changeTypeBadge(changeType) {
  // ADO changeType: 1=add, 2=edit, 8=rename, etc.
  if (changeType === 1) return { label: "Added", color: "success" };
  return { label: "Modified", color: "accent" };
}

export function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Serialize a value for safe embedding inside an inline <script> block.
// JSON.stringify alone is NOT safe there: it doesn't escape "<", so a string
// containing "</script>" closes the script element early (stored-XSS breakout),
// and U+2028/U+2029 are valid in JSON but illegal as raw JS string chars.
// Escaping "<" (and the two line separators) keeps the payload inert while
// staying valid JSON the browser parses back identically.
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function stripMarkdown(s) {
  return String(s)
    .replace(/^#{1,6}\s+/gm, "")       // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
    .replace(/\*([^*]+)\*/g, "$1")      // italic
    .replace(/__([^_]+)__/g, "$1")      // bold alt
    .replace(/_([^_]+)_/g, "$1")        // italic alt
    .replace(/`([^`]+)`/g, "$1")        // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^[-*]\s+/gm, "• ")        // list items
    .replace(/\n{2,}/g, " ")            // collapse newlines
    .replace(/\n/g, " ")
    .trim();
}

// A themed full-page error, so a failed route matches the design system instead
// of showing raw text. Pure + escaped; mirrors the pages' dark-mode auto-detect.
export function errorPage({ title = "Something went wrong", message = "", backHref = "/", backLabel = "Back" } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)}</title><style>${cssVariables()}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--cp-bg); color: var(--cp-text); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; }
.err-card { max-width: 460px; width: 100%; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 14px; box-shadow: var(--cp-shadow); padding: 28px 32px; text-align: center; }
.err-badge { width: 44px; height: 44px; border-radius: 50%; background: var(--cp-accent-soft); color: var(--cp-accent); display: inline-flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; margin-bottom: 14px; }
.err-card h1 { font-size: 18px; margin: 0 0 8px; }
.err-card p { font-size: 13px; color: var(--cp-text-muted); line-height: 1.5; margin: 0 0 18px; overflow-wrap: anywhere; }
.err-back { display: inline-block; font-size: 13px; font-weight: 600; color: var(--cp-accent-fg); background: var(--cp-accent); padding: 8px 18px; border-radius: 8px; text-decoration: none; }
</style><script>try{if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark';}catch(e){}</script></head><body><div class="err-card"><div class="err-badge">!</div><h1>${escHtml(title)}</h1>${message ? `<p>${escHtml(message)}</p>` : ""}<a class="err-back" href="${escHtml(backHref)}">${escHtml(backLabel)}</a></div></body></html>`;
}
