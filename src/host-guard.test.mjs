// Tests for the DNS-rebind Host allow-list (clickstop 2, step 5).
import { isAllowedHost } from "./host-guard.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// --- allowed loopback hosts (with and without :port) ---
ok("localhost", isAllowedHost("localhost"));
ok("localhost:38471", isAllowedHost("localhost:38471"));
ok("127.0.0.1", isAllowedHost("127.0.0.1"));
ok("127.0.0.1:3847", isAllowedHost("127.0.0.1:3847"));
ok("[::1]", isAllowedHost("[::1]"));
ok("[::1]:3847", isAllowedHost("[::1]:3847"));

// --- rejected (DNS-rebind style) ---
ok("evil.com rejected", !isAllowedHost("evil.com"));
ok("localhost.evil.com rejected", !isAllowedHost("localhost.evil.com"));
ok("127.0.0.1.evil.com rejected", !isAllowedHost("127.0.0.1.evil.com"));
ok("empty rejected", !isAllowedHost(""));
ok("null rejected", !isAllowedHost(null));
ok("bare host with attacker port suffix rejected", !isAllowedHost("attacker:80"));

console.log(`host-guard: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
