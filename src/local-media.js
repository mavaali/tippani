import path from "node:path";
import { imageContentType, resolveImagePath } from "./image-src.js";

// Decide whether a fully-local image request (a relative `<img>` in an
// open-file-view markdown page) may be served.
//
// Rule: resolve the image against the spec's directory, gate it to an image
// extension, reject path traversal, then require the resolved absolute path to be
// INSIDE an approved root — the same approval that let us open the markdown file.
// No git working tree is required: everything under an approved root's tree is
// approved, so images beside or below the opened file render. (This is also
// stricter than the old `validateLocalRepo` gate for a direct caller: only paths
// that land inside an approved root are served, whatever `local` is passed.)
//
// Returns { ok:true, abs, type } or { ok:false, reason }.
export function classifyLocalMedia({ local, spec, src } = {}, deps = {}) {
  const { isContained, pathImpl = path } = deps;
  const localPath = String(local ?? "").trim();
  if (!localPath) return { ok: false, reason: "no-local" };
  const specPath = String(spec ?? "").trim();
  if (!specPath) return { ok: false, reason: "no-spec" };
  const resolved = resolveImagePath(specPath, src);
  if (!resolved) return { ok: false, reason: "unresolvable" };
  const rel = String(resolved).replace(/^\/+/, "");
  if (!rel || rel.includes("\0") || /(^|[\\/])\.\.([\\/]|$)/.test(rel)) {
    return { ok: false, reason: "traversal" };
  }
  const type = imageContentType(rel);
  if (!type) return { ok: false, reason: "not-image" };
  const abs = pathImpl.join(localPath, rel);
  if (typeof isContained !== "function" || !isContained(abs)) {
    return { ok: false, reason: "not-approved" };
  }
  return { ok: true, abs, type };
}
