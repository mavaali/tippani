// Pure decision logic for the single-tab NAV_WATCHER steering script.
//
// The watcher polls /api/v1/state for a server-set navUrl/navSeq and steers the
// one open tab to that URL. It must NOT clobber a deliberate query deep-link
// (e.g. /file/0?edit=1) when the nav target is just the bare current path with
// no query of its own — otherwise a fresh browser (empty sessionStorage) sees a
// prior navSeq and strips the query before the page can act on it.
//
// These functions are injected verbatim into the client script (via toString)
// so the browser and the unit tests share one implementation.

export function navSkipsBarePathClobber(hereSearch, herePathname, navPathname, navSearch) {
  return navPathname === herePathname && !navSearch && !!hereSearch;
}

// Resolve the browser's per-tab navigation cursor against the current portal
// process. navSeq restarts at zero with each process, while sessionStorage
// survives a same-port restart. A changed epoch resets only that stale cursor;
// repeat suppression remains monotonic within one process.
export function navCursor(serverEpoch, serverSeq, storedEpoch, storedSeq) {
  const nextEpoch = typeof serverEpoch === "string" ? serverEpoch : "";
  const priorEpoch = typeof storedEpoch === "string" ? storedEpoch : "";
  const parsedStoredSeq = Number(storedSeq);
  const priorSeq = Number.isFinite(parsedStoredSeq) && parsedStoredSeq >= 0 ? parsedStoredSeq : 0;
  const reset = !!nextEpoch && nextEpoch !== priorEpoch;
  const lastSeq = reset ? 0 : priorSeq;
  const nextSeq = Number(serverSeq);
  return {
    epoch: nextEpoch || priorEpoch,
    lastSeq,
    shouldApply: Number.isFinite(nextSeq) && nextSeq > lastSeq,
  };
}

// Resolve a nav target to its SAME-ORIGIN path (pathname+search+hash), or null
// when the value is malformed, foreign-origin, a javascript: URL, or empty. The
// watcher navigates to THIS resolved path — never the raw navUrl — so a value
// that resolves off-origin (or into a script scheme) can never steer the tab
// off-app. This is the belt behind navShouldNavigate's gate.
export function navTarget(navUrl, origin) {
  let u;
  try { u = new URL(navUrl, origin); } catch (e) { return null; }
  if (u.origin !== origin) return null;
  const target = u.pathname + u.search + u.hash;
  return target || null;
}

export function navShouldNavigate(here, navUrl, origin) {
  const target = navTarget(navUrl, origin);
  if (!target) return false;
  let u;
  try { u = new URL(navUrl, origin); } catch (e) { return false; }
  if (navSkipsBarePathClobber(here.search, here.pathname, u.pathname, u.search)) return false;
  return target !== (here.pathname + here.search + (here.hash || ""));
}
