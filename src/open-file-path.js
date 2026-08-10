// Open-an-arbitrary-.md-file path validation (clickstop 2, step 1). Pure: given a
// caller-supplied path and the approved-roots `isContained` predicate, classify it
// as an openable file or a specific rejection the box/tool renders. Accept only an
// EXISTING, READABLE `.md` whose realpath sits INSIDE an approved root — a
// caller path must never read files anywhere.
//
// Rejection reasons: "empty" | "not-md" | "missing" | "directory" | "not-file" |
// "unreadable" | "outside-root" | "symlink-escape".
import fsDefault from "node:fs";
import pathDefault from "node:path";

export function classifyOpenFilePath(input, { fs = fsDefault, path = pathDefault, isContained } = {}) {
  const reject = (reason, error) => ({ ok: false, reason, error });

  const raw = String(input || "").trim();
  if (!raw) return reject("empty", "Enter a path to a .md file.");

  const abs = path.resolve(raw);
  // Extension first — cheap, and doesn't leak whether an off-limits path exists.
  if (!/\.md$/i.test(abs)) return reject("not-md", "Only .md files can be opened here.");

  // Resolve symlinks up front so containment is checked against the REAL target.
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch (e) {
    if (e && (e.code === "EACCES" || e.code === "EPERM"))
      return reject("unreadable", "That file can't be read.");
    return reject("missing", "No file at that path.");
  }

  let st;
  try { st = fs.statSync(real); } catch { return reject("missing", "No file at that path."); }
  if (st.isDirectory()) return reject("directory", "That's a folder, not a .md file.");
  if (!st.isFile()) return reject("not-file", "That path is not a regular file.");

  try { fs.accessSync(real, (fs.constants && fs.constants.R_OK) || 4); }
  catch { return reject("unreadable", "That file can't be read."); }

  // Containment: the REAL path must be inside an approved root.
  if (!isContained(real)) {
    // Lexically inside a root but real path escaped it → a symlink escape;
    // otherwise it was never under an approved root at all.
    return isContained(abs)
      ? reject("symlink-escape", "That path escapes its approved folder through a symlink.")
      : reject("outside-root", "Open the file's folder in Tippani first — it's outside every approved folder.");
  }

  return { ok: true, realpath: real };
}

// Validate a path being ADDED to the Custom list (clickstop 2). Same checks as
// classifyOpenFilePath MINUS the approved-root containment: adding a file IS the
// user's deliberate approval of its folder, so "outside every root" is expected,
// not an error. Still rejects a non-`.md`, missing, directory, non-regular, or
// unreadable path. Returns { ok:true, realpath } for the caller to persist +
// approve, or a classified rejection the box renders inline.
//
// Rejection reasons: "empty" | "not-md" | "missing" | "directory" | "not-file" |
// "unreadable".
export function classifyAddFile(input, { fs = fsDefault, path = pathDefault } = {}) {
  const reject = (reason, error) => ({ ok: false, reason, error });

  const raw = String(input || "").trim();
  if (!raw) return reject("empty", "Enter a path to a .md file.");

  const abs = path.resolve(raw);
  if (!/\.md$/i.test(abs)) return reject("not-md", "Only .md files can be added here.");

  // Resolve symlinks so the stored path (and its approved folder) is the REAL one.
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch (e) {
    if (e && (e.code === "EACCES" || e.code === "EPERM"))
      return reject("unreadable", "That file can't be read.");
    return reject("missing", "No file at that path.");
  }

  let st;
  try { st = fs.statSync(real); } catch { return reject("missing", "No file at that path."); }
  if (st.isDirectory()) return reject("directory", "That's a folder, not a .md file.");
  if (!st.isFile()) return reject("not-file", "That path is not a regular file.");

  try { fs.accessSync(real, (fs.constants && fs.constants.R_OK) || 4); }
  catch { return reject("unreadable", "That file can't be read."); }

  return { ok: true, realpath: real };
}
