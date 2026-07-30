// Shared top-header breadcrumb for every portal page. Pure + importable so it
// is covered by breadcrumb.test.mjs under `npm test` (no ADO fixture).
//
// A trail is an ordered array of `{ label, href? }`. Items with an href render
// as links to a parent page; the last item (or any item without an href)
// renders as the current page (bold, not a link). "Home" is simply the first
// crumb the caller supplies. Styles are inlined so no per-page CSS is required,
// and every label/href is HTML-escaped (stored-XSS guardrail).

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCrumbs(trail) {
  const items = (Array.isArray(trail) ? trail : []).filter((c) => c && c.label != null);
  if (items.length === 0) return "";
  const linkStyle = "color:var(--cp-accent,#0969da);text-decoration:none;white-space:nowrap";
  const curStyle = "color:var(--cp-text,#111);font-weight:600;white-space:nowrap";
  const sep = '<span aria-hidden="true" style="color:var(--cp-text-muted,#9aa0a6);opacity:.7">\u203a</span>';
  const parts = items.map((c, i) => {
    const last = i === items.length - 1;
    const label = esc(c.label);
    return last || !c.href
      ? `<span aria-current="page" style="${curStyle}">${label}</span>`
      : `<a href="${esc(c.href)}" style="${linkStyle}">${label}</a>`;
  });
  return (
    '<nav aria-label="Breadcrumb" class="tp-crumbs" ' +
    'style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13px;min-width:0">' +
    parts.join(sep) +
    "</nav>"
  );
}

// Full-width slim "top row" that holds the breadcrumb, left-aligned, in the same
// graphite (var(--cp-bg-elevated)) as the file-view topbars — one consistent
// header strip across every page. Sits flush at the very top, edge to edge.
//
// Some page bodies are centered flex containers with static padding
// (`display:flex; align-items:center; padding:<padTop>px <padX>px`), which would
// otherwise center + indent the bar. Pass that padding as `{ padTop, padX }` and
// the bar cancels it with `align-self:stretch` + negative margins so it spans the
// full page with no margins. Bodies with no padding pass nothing (defaults 0).
// A tiny self-contained poller embedded once per page (guarded) that fills the
// top-row center with "You have n staged changes · Push to remote" from
// /api/v1/staged. Push posts to /api/v1/branches/push then reloads.
const STAGED_HINT_SCRIPT = `<script>(function(){
  if (window.__tpStagedInit) return; window.__tpStagedInit = 1;
  function el(){ return document.getElementById('tpStaged'); }
  async function refresh(){
    var e = el(); if (!e) return;
    try {
      var r = await fetch('/api/v1/staged'); if (!r.ok) { e.innerHTML=''; return; }
      var d = await r.json(); var n = (d && d.count) || 0;
      if (n > 0) {
        e.innerHTML = 'You have <strong style="color:var(--cp-text,#e6edf3)">'+n+'</strong> staged change'+(n===1?'':'s')+' \u00b7 <a href="#" id="tpPush" style="color:var(--cp-accent,#316dca);text-decoration:none;font-weight:600">Push to remote</a>';
        var p = document.getElementById('tpPush'); if (p) p.addEventListener('click', push);
      } else { e.innerHTML=''; }
    } catch (x) {}
  }
  async function push(ev){ ev.preventDefault(); var e=el(); if(e) e.textContent='Pushing\u2026'; try { await fetch('/api/v1/branches/push',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); } catch(x){} location.reload(); }
  window.__tpStagedRefresh = refresh; refresh();
})();<\/script>`;

export function renderCrumbBar(trail, opts = {}) {
  const inner = renderCrumbs(trail);
  if (!inner) return "";
  const padTop = Number(opts.padTop) || 0;
  const padX = Number(opts.padX) || 0;
  const right = opts.right
    ? '<div class="tp-topbar-right" style="margin-left:auto;display:flex;' +
      'align-items:center;gap:10px;flex-shrink:0">' +
      opts.right +
      "</div>"
    : "";
  const center =
    '<div class="tp-topbar-center" id="tpStaged" style="position:absolute;left:50%;' +
    "top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px;" +
    'font-size:12px;color:var(--cp-text-muted,#8b949e);white-space:nowrap"></div>';
  return (
    '<div class="tp-topbar" ' +
    'style="position:relative;box-sizing:border-box;align-self:stretch;display:flex;align-items:center;' +
    "justify-content:flex-start;height:34px;padding:0 16px;" +
    `margin:${-padTop}px ${-padX}px 18px;` +
    "background:var(--cp-bg-elevated,#22272e);" +
    'border-bottom:1px solid var(--cp-border,#30363d);flex-shrink:0">' +
    inner +
    center +
    right +
    "</div>" +
    STAGED_HINT_SCRIPT
  );
}

// The "FS · Tippani · <sub>" product brand, sized to sit on the right of the
// top crumb bar. Self-contained inline styles use the same theme vars as the
// old .brand-bar so it looks identical, just smaller (fits the 34px bar).
export function renderBrand(sub) {
  const s = sub == null ? "" : String(sub).trim();
  return (
    '<span class="tp-brand" style="display:flex;align-items:center;gap:8px;' +
    'flex-shrink:0;white-space:nowrap">' +
    '<span style="width:20px;height:20px;border-radius:5px;background:var(--cp-accent,#316dca);' +
    "color:var(--cp-accent-fg,#fff);display:flex;align-items:center;justify-content:center;" +
    'font-size:10px;font-weight:700">FS</span>' +
    '<span style="font-size:13px;font-weight:600;color:var(--cp-text,#e6edf3)">Tippani</span>' +
    (s
      ? `<span style="font-size:12px;color:var(--cp-text-muted,#8b949e)">\u00b7 ${esc(s)}</span>`
      : "") +
    "</span>"
  );
}
