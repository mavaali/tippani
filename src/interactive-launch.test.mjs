// Unit tests for the interactive-launch prompt helpers (run: npm run test:interactivelaunch).
import { promptLine, resolveAnswer } from "./interactive-launch.js";

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}
function eq(name, a, b) {
  ok(name, JSON.stringify(a) === JSON.stringify(b));
}

// --- promptLine ---
eq("shows cached default in brackets", promptLine("Org", "https://dev.azure.com/myorg"), "Org [https://dev.azure.com/myorg]: ");
eq("no bracket when no default", promptLine("Org", null), "Org: ");
eq("no bracket for undefined default", promptLine("Org", undefined), "Org: ");
eq("no bracket for blank default", promptLine("Org", "   "), "Org: ");
eq("trims default shown in brackets", promptLine("Org", "  myorg  "), "Org [myorg]: ");

// --- resolveAnswer ---
eq("empty answer falls back to default", resolveAnswer("", "myorg"), "myorg");
eq("whitespace-only answer falls back to default", resolveAnswer("   ", "myorg"), "myorg");
eq("typed answer wins over default", resolveAnswer("otherorg", "myorg"), "otherorg");
eq("typed answer is trimmed", resolveAnswer("  otherorg  ", "myorg"), "otherorg");
eq("no answer and no default is empty string", resolveAnswer("", null), "");
eq("null answer falls back to default", resolveAnswer(null, "myorg"), "myorg");

console.log(`\ninteractive-launch.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
