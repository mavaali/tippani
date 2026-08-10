// Tests for pr-version.js — PR content version resolution + ADO error detection.
import { prContentVersion, toVersionDescriptor, adoErrorInContent } from "./pr-version.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}

// --- prContentVersion: prefer the source commit ---
check("prefers source commit (Commit=2)",
  JSON.stringify(prContentVersion({ lastMergeSourceCommit: { commitId: "abc123" }, sourceRefName: "refs/heads/spec/x" }))
  === JSON.stringify({ version: "abc123", versionType: 2 }));

check("falls back to branch name (Branch=0) when no commit",
  JSON.stringify(prContentVersion({ sourceRefName: "refs/heads/spec/x" }))
  === JSON.stringify({ version: "spec/x", versionType: 0 }));

check("empty PR yields empty branch descriptor",
  JSON.stringify(prContentVersion({})) === JSON.stringify({ version: "", versionType: 0 }));

check("null commitId falls back to branch",
  JSON.stringify(prContentVersion({ lastMergeSourceCommit: { commitId: null }, sourceRefName: "refs/heads/main" }))
  === JSON.stringify({ version: "main", versionType: 0 }));

// --- toVersionDescriptor: accept string or descriptor ---
check("normalizes a bare branch string (strips refs/heads/)",
  JSON.stringify(toVersionDescriptor("refs/heads/feature/y"))
  === JSON.stringify({ version: "feature/y", versionType: 0 }));

check("passes through a descriptor unchanged",
  JSON.stringify(toVersionDescriptor({ version: "deadbeef", versionType: 2 }))
  === JSON.stringify({ version: "deadbeef", versionType: 2 }));

check("null string → empty branch descriptor",
  JSON.stringify(toVersionDescriptor(null)) === JSON.stringify({ version: "", versionType: 0 }));

// --- adoErrorInContent: detect the ADO error envelope ---
const tf401175 = '{"$id":"1","innerException":null,"message":"TF401175:The version descriptor <Branch: spec/hltest-b > could not be resolved to a version in the repository tippani-sandbox","typeName":"Microsoft.TeamFoundation.Git.Server.GitUnresolvableToCommitException, Microsoft.TeamFoundation.Git.Server","typeKey":"GitUnresolvableToCommitException","errorCode":0,"eventId":3000}';
check("detects TF401175 error envelope, returns its message",
  adoErrorInContent(tf401175) === "TF401175:The version descriptor <Branch: spec/hltest-b > could not be resolved to a version in the repository tippani-sandbox");

check("real markdown is not an error", adoErrorInContent("# My Spec\n\nSome body text.") === null);

check("markdown starting with a brace but not an ADO error is not flagged",
  adoErrorInContent('{ this is not json } and this is prose') === null);

check("valid JSON without ADO error shape is not flagged",
  adoErrorInContent('{"title":"hello","body":"world"}') === null);

check("non-string input is null", adoErrorInContent(null) === null);

console.log(`\npr-version.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
