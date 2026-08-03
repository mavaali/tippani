// Tests for classifyLocalMedia — the gate for serving a relative <img> in an
// open-file-view markdown page. Rule: the image must resolve INSIDE an approved
// root (the same approval that opened the markdown file), with no git working
// tree required. Pure; injected isContained + path.
import path from "node:path";
import { classifyLocalMedia } from "./local-media.js";
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// Root "/r" is approved; containment is pure string prefix.
const isContained = (p) => p === "/r" || (typeof p === "string" && p.startsWith("/r/"));
const deps = { isContained, pathImpl: path.posix };

// --- rejections --------------------------------------------------------------
ok("missing local -> no-local", classifyLocalMedia({ local: "", spec: "s.md", src: "a.png" }, deps).reason === "no-local");
ok("missing spec -> no-spec", classifyLocalMedia({ local: "/r", spec: "", src: "a.png" }, deps).reason === "no-spec");
ok("external src -> unresolvable", classifyLocalMedia({ local: "/r", spec: "s.md", src: "https://x/a.png" }, deps).reason === "unresolvable");
ok("data uri -> unresolvable", classifyLocalMedia({ local: "/r", spec: "s.md", src: "data:image/png;base64,AAA" }, deps).reason === "unresolvable");
ok("non-image -> not served", classifyLocalMedia({ local: "/r", spec: "s.md", src: "notes.txt" }, deps).ok === false);
ok("image OUTSIDE an approved root -> not-approved", classifyLocalMedia({ local: "/other", spec: "s.md", src: "a.png" }, deps).reason === "not-approved");
ok("no isContained -> not-approved", classifyLocalMedia({ local: "/r", spec: "s.md", src: "a.png" }, { pathImpl: path.posix }).reason === "not-approved");

// --- accept ------------------------------------------------------------------
const good = classifyLocalMedia({ local: "/r/docs", spec: "spec.md", src: "img/a.png" }, deps);
ok("approved image -> ok", good.ok === true);
ok("approved image abs", good.abs === "/r/docs/img/a.png");
ok("approved image type", good.type === "image/png");

// The actual bug: an image in a SUBFOLDER beside/below the opened file renders,
// as long as it lands under an approved root.
const sub = classifyLocalMedia({ local: "/r/scratch", spec: "plan.md", src: "mockup/shots/x.png" }, deps);
ok("image below the file's folder -> ok", sub.ok === true && sub.abs === "/r/scratch/mockup/shots/x.png");

console.log(`local-media: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
