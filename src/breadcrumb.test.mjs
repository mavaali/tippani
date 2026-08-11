// Tests for the shared breadcrumb renderer.
import { renderCrumbs, renderCrumbBar, renderBrand } from "./breadcrumb.js";

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// empty / invalid → empty string
check("empty trail → ''", renderCrumbs([]) === "");
check("null → ''", renderCrumbs(null) === "");
check("undefined → ''", renderCrumbs(undefined) === "");

// single current crumb → a bold current span, no link
{
  const h = renderCrumbs([{ label: "Home" }]);
  check("single: has current span", h.includes('aria-current="page"') && h.includes("Home"));
  check("single: no anchor", !h.includes("<a "));
  check("single: wrapped in nav", h.includes('aria-label="Breadcrumb"'));
}

// links for non-last items, current for the last
{
  const h = renderCrumbs([
    { label: "Home", href: "/discovery" },
    { label: "PR #42", href: "/" },
    { label: "Feedback" },
  ]);
  check("multi: Home is a link", h.includes('<a href="/discovery"') && h.includes(">Home</a>"));
  check("multi: PR is a link", h.includes('<a href="/"') && h.includes(">PR #42</a>"));
  check("multi: Feedback is current (no link)", h.includes('aria-current="page"') && h.includes(">Feedback</span>"));
  check("multi: has a separator", h.includes("\u203a"));
}

// an item without href renders as current even if not last
{
  const h = renderCrumbs([{ label: "A" }, { label: "B", href: "/b" }]);
  check("no-href item → current span", h.includes(">A</span>"));
}

// HTML escaping of labels + hrefs (stored-XSS guardrail)
{
  const h = renderCrumbs([{ label: '<b>x</b>', href: '"/a"onmouseover="y' }, { label: "cur & <ok>" }]);
  check("escapes label <>", !h.includes("<b>x</b>") && h.includes("&lt;b&gt;x&lt;/b&gt;"));
  check("escapes href quotes", !h.includes('"/a"onmouseover'));
  check("escapes current & <>", h.includes("cur &amp; &lt;ok&gt;"));
}

// renderBrand: product brand markup
{
  const b = renderBrand("feedback");
  check("brand: has FS logo", b.includes(">FS<"));
  check("brand: has Tippani", b.includes(">Tippani</span>"));
  check("brand: has middot + sub", b.includes("\u00b7 feedback"));
  check("brand: escapes sub", renderBrand("<b>x</b>").includes("&lt;b&gt;x&lt;/b&gt;"));
  check("brand: empty sub → no middot span", !renderBrand("").includes("\u00b7"));
}

// renderCrumbBar right-content: staged hint stays centered until right content needs space
{
  const bar = renderCrumbBar([{ label: "Home" }], { right: renderBrand("discovery") });
  check("bar right: contains brand", bar.includes(">Tippani</span>"));
  check("bar right: right block owns flexible spacer", bar.includes('class="tp-topbar-right" style="margin-left:auto'));
  check("bar right: center starts at true center", bar.includes('class="tp-topbar-center" id="tpStaged" style="position:absolute;left:50%'));
  check("bar right: center clamps against measured right edge", bar.includes("Math.min(centered,clearOfRight)"));
  check("bar right: layout observes control width changes", bar.includes("new ResizeObserver(layout)"));
  check("bar right: crumb still present", bar.includes(">Home</span>"));
  check("bar no-right: no right block", !renderCrumbBar([{ label: "Home" }]).includes('class="tp-topbar-right"'));
  check("push success invalidates remote branch cache", bar.includes("sessionStorage.removeItem('tippani.brCache.remote')"));
  check("push cache invalidation precedes reload", bar.indexOf("sessionStorage.removeItem('tippani.brCache.remote')") < bar.indexOf("location.reload()"));
  check("push success persists Current view", bar.includes("JSON.stringify({view:'current'})"));
  check("Current view reset precedes reload", bar.indexOf("JSON.stringify({view:'current'})") < bar.indexOf("location.reload()"));
  // Clickstop: staged hint counts BOTH authoring staging (/api/v1/staged) and
  // PR-mode review-pending staging (/api/pending) so the top bar shows a count
  // in PR mode too, not just Branch/authoring mode.
  check("staged hint: fetches authoring staged count", bar.includes("fetchCount('/api/v1/staged')"));
  check("staged hint: fetches PR-mode review-pending count", bar.includes("fetchCount('/api/pending')"));
  check("staged hint: sums both counts", bar.includes("counts[0] + counts[1]"));
}

console.log(`\nbreadcrumb.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
