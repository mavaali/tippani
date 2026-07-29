// Tests for the pure spec-search error/message builder. Pure.
import { specSearchUnavailableMessage, orgLabel } from "./spec-search-error.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

const ORG = "https://dev.azure.com/SQLBI4WA";

// orgLabel extracts the org segment, tolerant of trailing slash.
ok("orgLabel from url", orgLabel(ORG) === "SQLBI4WA");
ok("orgLabel trims trailing slash", orgLabel("https://dev.azure.com/Foo/") === "Foo");
ok("orgLabel falls back on empty", orgLabel("") === "the organization");

// The Code Search hint leads for a 404 (missing extension) and carries the detail.
const m404 = specSearchUnavailableMessage('Not found (404). Check --project and --repo names.', ORG);
ok("404 mentions Code Search", /Code Search is not enabled/.test(m404));
ok("404 names the org", /SQLBI4WA/.test(m404));
ok("404 keeps the underlying detail", /Not found \(404\)/.test(m404));
ok("404 suggests an actionable alternative", /open_branch_file/.test(m404));

// A generic/unknown error still degrades to the Code Search hint (most common cause).
ok("generic error gets the hint", /Code Search is not enabled/.test(specSearchUnavailableMessage('socket hang up', ORG)));
ok("empty detail is tolerated", /unknown error/.test(specSearchUnavailableMessage('', ORG)));

// Auth/access failures are surfaced verbatim (the Code Search hint would mislead).
const m401 = specSearchUnavailableMessage('Authentication failed (401). Your credentials may be expired.', ORG);
ok("401 is verbatim, no Code Search hint", /Authentication failed/.test(m401) && !/Code Search/.test(m401));
const m403 = specSearchUnavailableMessage('Access denied (403). Your account may lack access.', ORG);
ok("403 is verbatim, no Code Search hint", /Access denied/.test(m403) && !/Code Search/.test(m403));

// It never emits the old dishonest "check the server console" phrasing.
ok("never says check the server console", !/check the server console/i.test(m404));

console.log(`spec-search-error: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
