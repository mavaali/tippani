// Reading list (Discovery "Reading list" tab) shaping — pure + importable so it
// is unit-tested without starting the portal.
//
// The list always ends with a PINNED "User Manual" tile that points at the
// Tippani README. It is not persisted in custom-files.json (it is a computed
// default), is never removable, and its folder becomes an approved open-file
// root so the manual renders through /open-file-view. User-added `.md` files
// precede it. Because the manual is always present, the Reading list is never
// empty.

// Build the pinned manual tile from the README path, or null if it is missing
// (e.g. a packaged binary with no adjacent README) — best-effort, never throws.
export function manualTile({ readmePath, fs, path } = {}) {
  try {
    if (!readmePath || !fs.existsSync(readmePath)) return null;
    const real = fs.realpathSync(readmePath);
    return {
      path: real,
      dir: path.dirname(real),
      name: "Tippani — User Manual",
      summary:
        "Read this first — how to read, annotate, edit, and publish Azure DevOps PR specs in Tippani.",
      pinned: true,
      openHref: `/open-file-view?path=${encodeURIComponent(real)}`,
    };
  } catch {
    return null;
  }
}

// Shape the durable custom-file entries into Reading-list tiles, prepending the
// pinned manual and de-duplicating it from any user entry with the same path.
export function buildReadingList({ entries, readmePath, fs, path } = {}) {
  const pinned = manualTile({ readmePath, fs, path });
  const userTiles = (entries || [])
    .filter((e) => e && typeof e.path === "string")
    .filter((e) => !(pinned && e.path === pinned.path))
    .map((e) => ({
      path: e.path,
      dir: path.dirname(e.path),
      name: path.basename(e.path),
      addedAt: e.addedAt || null,
      summary: "",
      pinned: false,
      openHref: `/open-file-view?path=${encodeURIComponent(e.path)}`,
    }));
  return pinned ? [...userTiles, pinned] : userTiles;
}

// True when `p` is the pinned manual's realpath — used to refuse its removal.
export function isPinnedManual(p, { readmePath, fs, path } = {}) {
  const pinned = manualTile({ readmePath, fs, path });
  return !!(pinned && String(p || "").trim() === pinned.path);
}

// The manual's folder (an approved open-file root), or null when absent.
export function manualRoot({ readmePath, fs, path } = {}) {
  const pinned = manualTile({ readmePath, fs, path });
  return pinned ? pinned.dir : null;
}
