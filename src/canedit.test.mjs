// Unit tests for the canEdit gate (run: npm run test:canedit).
import { decideCanEdit } from "./canedit.js";

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

// Status gate — a finished PR is never editable, even offline or with a true probe.
ok("completed PR (status 2) => false", decideCanEdit({ isOffline: false, hasConn: true, prStatus: 2, probe: true }) === false);
ok("abandoned PR (status 3) => false", decideCanEdit({ isOffline: false, hasConn: true, prStatus: 3, probe: true }) === false);
ok("non-active PR offline => false", decideCanEdit({ isOffline: true, hasConn: false, prStatus: 3, probe: null }) === false);

// Offline editing IS allowed on an active PR (edits queue and sync on reconnect).
ok("offline + active => true", decideCanEdit({ isOffline: true, hasConn: false, prStatus: 1, probe: null }) === true);

// Online: unauthenticated can't push.
ok("online + no connection => false", decideCanEdit({ isOffline: false, hasConn: false, prStatus: 1, probe: true }) === false);

// Probe outcomes on an active, connected, online PR.
ok("active + probe true => true", decideCanEdit({ isOffline: false, hasConn: true, prStatus: 1, probe: true }) === true);
ok("active + probe false => false", decideCanEdit({ isOffline: false, hasConn: true, prStatus: 1, probe: false }) === false);
ok("active + probe null (indeterminate) => true (fail open)", decideCanEdit({ isOffline: false, hasConn: true, prStatus: 1, probe: null }) === true);
ok("active + probe undefined (not run) => true (fail open)", decideCanEdit({ isOffline: false, hasConn: true, prStatus: 1 }) === true);

console.log(`\ncanedit.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
