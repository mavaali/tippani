import { JSDOM } from "jsdom";
import { wireMentionComposers } from "./mention-composer.js";

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) pass++;
  else { fail++; console.error(`FAIL: ${name}`); }
}

const dom = new JSDOM('<!doctype html><body><div><textarea data-mention-composer></textarea></div></body>');
const { document, Event, KeyboardEvent } = dom.window;
wireMentionComposers(document, [
  { id: "ada-id", displayName: "Ada Lovelace", uniqueName: "ada@example.com" },
  { id: "grace-id", displayName: "Grace Hopper", uniqueName: "grace@example.com" },
], true);
const box = document.querySelector("textarea");
box.value = "Ask @Ad";
box.selectionStart = box.selectionEnd = box.value.length;
box.dispatchEvent(new Event("input", { bubbles: true }));
check("typing @ filters participants", document.querySelectorAll(".mention-option").length === 1);
box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
check("keyboard inserts visible token", box.value === "Ask @Ada Lovelace ");
check("selected token has a chip", document.querySelector(".mention-chip")?.textContent === "@Ada Lovelace");
check("payload keeps identity", dom.window.tippaniMentionPayload(box)[0]?.id === "ada-id");
check("offline behavior is explicit", !!document.querySelector(".mention-offline"));
box.value += "@Gr";
box.selectionStart = box.selectionEnd = box.value.length;
box.dispatchEvent(new Event("input", { bubbles: true }));
box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
check("Escape preserves draft", !document.querySelector(".mention-list") && box.value.endsWith("@Gr"));

console.log(`mention-composer.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
