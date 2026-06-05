// Unit tests for ADO push conflict detection (run: npm run test:conflict).
import { isConflict } from "./conflict.js";

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

ok("409 status is a conflict", isConflict({ statusCode: 409 }));
ok("status alias is a conflict", isConflict({ status: 409 }));
ok(
  "TF401028 ref-updated message",
  isConflict({
    message:
      "TF401028: The reference 'refs/heads/feature/x' has already been updated by another client.",
  })
);
ok("non-fast-forward message", isConflict({ message: "non-fast-forward update rejected" }));
ok("Error instance", isConflict(new Error("TF401028: stale ref")));
ok("plain network error is NOT a conflict", !isConflict({ message: "ECONNRESET network down" }));
ok("auth error is NOT a conflict", !isConflict({ statusCode: 401, message: "unauthorized" }));
ok("null is NOT a conflict", !isConflict(null));
ok("undefined is NOT a conflict", !isConflict(undefined));

console.log(`\nconflict.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
