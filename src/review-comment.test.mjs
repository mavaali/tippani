import {
  collectReviewParticipants,
  composeReviewComment,
  displayAdoMentions,
  mapSelectionToSource,
} from "./review-comment.js";

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) pass++;
  else { fail++; console.error(`FAIL: ${name}`); }
}
function equal(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected));
}

equal("selection maps to exact ADO span",
  mapSelectionToSource("Alpha beta gamma.", { startLine: 1, endLine: 1 }, "beta"),
  { exact: true, start: { line: 1, offset: 7 }, end: { line: 1, offset: 10 } });
check("ambiguous selection falls back to block",
  mapSelectionToSource("Alpha Alpha", { startLine: 1, endLine: 1 }, "Alpha").exact === false);

const ado = composeReviewComment("Ask @Ada Lovelace.", {
  quote: "beta",
  hostKind: "ado",
  mentions: [{ id: "user-guid", displayName: "Ada Lovelace", marker: "@Ada Lovelace" }],
});
check("quoted selection persists", ado.startsWith("> beta\n\n"));
check("ADO mention uses recognized markup", ado.includes('data-vss-mention="version:2.0,user-guid"'));
check("ADO mention renders as visible name", displayAdoMentions(ado).includes("@Ada Lovelace"));

const github = composeReviewComment("Ask @Ada Lovelace.", {
  hostKind: "github",
  mentions: [{ id: "octocat", displayName: "Ada Lovelace", marker: "@Ada Lovelace" }],
});
check("GitHub mention posts the login", github === "Ask @octocat.");

equal("participants are unique and sorted", collectReviewParticipants({
  createdBy: { id: "2", displayName: "Zoe" },
  reviewers: [{ id: "1", displayName: "Ada" }],
}, [{ comments: [{ author: { id: "1", displayName: "Ada" } }] }]), [
  { id: "1", displayName: "Ada", uniqueName: "" },
  { id: "2", displayName: "Zoe", uniqueName: "" },
]);

console.log(`review-comment.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
