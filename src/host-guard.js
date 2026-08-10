// DNS-rebinding Host allow-list (clickstop 2, step 5 — extracted from index.js,
// behavior preserved). The portal binds loopback only, so a legitimate request's
// Host header is always localhost / 127.0.0.1 / [::1]; a DNS-rebind attack arrives
// with the attacker's hostname (which resolves to 127.0.0.1 in the victim's
// browser). Every request is checked, so this stays a pure, importable predicate
// with its own test rather than only being exercised live.
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isAllowedHost(hostHeader) {
  const host = String(hostHeader || "");
  const name = host.replace(/:\d+$/, ""); // strip :port
  return ALLOWED_HOSTS.has(name);
}
