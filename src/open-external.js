// Pure resolver for the /open-external route: decide what a clicked
// rendered-markdown link should do.
//
//   - http(s):// and mailto: links open EXTERNALLY (OS default browser).
//   - javascript:/data:/vbscript:/file: are rejected (never opened).
//   - a relative link is resolved against the open file's directory:
//       * an .md file that stays under the CURRENT FILE'S ROOT FOLDER (its
//         approved root, or its own directory when no root is known) opens
//         IN TIPPANI (the read-only reviewing view);
//       * any other in-scope target (a non-.md file, or a file still inside the
//         doc's own tree / an approved root) opens EXTERNALLY;
//       * a target that escapes every approved root and the doc's own folder is
//         rejected.
//   - a relative link with no open file (no base) can't be resolved → rejected.
//
// Returns one of:
//   { action:"tippani", path }            open `path` (an absolute .md) in Tippani
//   { action:"external", kind, target }   open `target` (url or file) externally
//   { error, status }                     reject
import fsDefault from "fs";
import pathDefault from "path";

export function resolveLinkAction(href, base, { isContained, containingRoot, fs = fsDefault, path = pathDefault } = {}) {
  const h = String(href || "").trim();
  if (!h) return { error: "missing href", status: 400 };
  if (/^(javascript|data|vbscript|file):/i.test(h)) {
    return { error: "unsupported link scheme", status: 400 };
  }
  if (/^(https?:\/\/|mailto:)/i.test(h)) {
    return { action: "external", kind: "url", target: h };
  }
  const b = String(base || "").trim();
  if (!b) return { error: "cannot resolve a relative link without an open file", status: 400 };

  const rel = h.split(/[?#]/)[0];
  const abs = path.resolve(path.dirname(b), rel);
  let real = abs;
  try { real = fs.realpathSync(abs); } catch { /* target may not exist yet */ }
  let baseReal = path.resolve(b);
  try { baseReal = fs.realpathSync(baseReal); } catch { /* keep resolved path */ }
  const baseDir = path.dirname(baseReal);

  // The "root folder of the current file": its approved root when known, else
  // its own directory. A subfolder under this root counts as the same root.
  const root = (typeof containingRoot === "function" && containingRoot(baseReal)) || baseDir;
  const underRoot = real === root || real.startsWith(root + path.sep);
  const withinDocTree = real === baseDir || real.startsWith(baseDir + path.sep);
  const isMd = /\.md$/i.test(rel);

  if (isMd && underRoot) {
    return { action: "tippani", path: abs };
  }
  if (underRoot || withinDocTree || (typeof isContained === "function" && isContained(real))) {
    return { action: "external", kind: "file", target: abs };
  }
  return { error: "link target is outside the document's folder", status: 403 };
}
