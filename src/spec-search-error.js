// Pure message builder for the search_specs failure path. Extracted from
// index.js (which runs a server on import and isn't unit-testable) so it can be
// covered by spec-search-error.test.mjs.
//
// search_specs relies on ADO Code Search (almsearch.dev.azure.com), a per-org
// extension. A brand-new org without it provisioned fails the search call even
// though Git-based reads (open_branch, open_branch_file) work — the most common
// cause of a failure here. We surface that hint alongside the real underlying
// error so the message is both TRUE and ACTIONABLE, never a generic
// "check the server console".

// "https://dev.azure.com/contoso" -> "contoso"; falls back to the raw value.
export function orgLabel(org) {
  const s = String(org || "").replace(/\/+$/, "");
  const seg = s.split("/").pop();
  return seg || s || "the organization";
}

// Build the LLM-/user-facing error for a failed spec search. `detail` is the
// already-friendly ADO error string; `org` is the configured ADO org URL.
// Auth/access failures (401/403) are surfaced verbatim — they're their own
// problem and the Code Search hint would be misleading. Everything else (most
// notably a 404 from the almsearch host on an org without Code Search) leads
// with the Code Search hint plus the underlying detail.
export function specSearchUnavailableMessage(detail, org) {
  const d = String(detail || "").trim() || "unknown error";
  const isAuth =
    /\b401\b/.test(d) ||
    /\b403\b/.test(d) ||
    /Authentication failed/i.test(d) ||
    /Access denied/i.test(d);
  if (isAuth) return `Spec search unavailable: ${d}`;
  const org_ = orgLabel(org);
  return (
    `Spec search unavailable: ${d} — this usually means ADO Code Search is ` +
    `not enabled for org "${org_}". Install the "Code Search" extension for ` +
    `the organization, or use open_branch_file with a known path.`
  );
}
