// Pure resolver for the /open-external route: decide what a clicked
// rendered-markdown link should hand to the OS default opener.
//
// Rules:
//   - http(s):// and mailto: links open as-is (a URL).
//   - javascript:/data:/vbscript:/file: are rejected (never opened).
//   - a relative link is resolved against the open file's directory and must
//     stay INSIDE that document's own folder tree, or inside an approved root,
//     before it is allowed — a "../.." escape above the doc's folder that lands
//     outside every approved root is rejected.
//   - a relative link with no open file (no base) can't be resolved → rejected.
//
// Returns { ok:true, target, kind:"url"|"file" } or { error, status }.
import fsDefault from "fs";
import pathDefault from "path";

export function resolveExternalLinkTarget(href, base, { isContained, fs = fsDefault, path = pathDefault } = {}) {
  const h = String(href || "").trim();
  if (!h) return { error: "missing href", status: 400 };
  if (/^(javascript|data|vbscript|file):/i.test(h)) {
    return { error: "unsupported link scheme", status: 400 };
  }
  if (/^(https?:\/\/|mailto:)/i.test(h)) {
    return { ok: true, target: h, kind: "url" };
  }
  const b = String(base || "").trim();
  if (!b) return { error: "cannot resolve a relative link without an open file", status: 400 };

  const abs = path.resolve(path.dirname(b), h.split(/[?#]/)[0]);
  let real = abs;
  try { real = fs.realpathSync(abs); } catch { /* target may not exist yet */ }
  const baseDir = path.dirname(path.resolve(b));
  const withinDocTree = real === baseDir || real.startsWith(baseDir + path.sep);
  if (!withinDocTree && !(typeof isContained === "function" && isContained(real))) {
    return { error: "link target is outside the document's folder", status: 403 };
  }
  return { ok: true, target: abs, kind: "file" };
}
