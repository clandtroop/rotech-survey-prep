// Self-healing for lazily-loaded chunks after a deploy.
//
// The failure this fixes, from the field report that prompted it:
//
//   Export failed. ...
//   Failed to fetch dynamically imported module:
//   https://clandtroop.github.io/rotech-survey-prep/assets/jszip.min-CeKhKoQW.js
//
// Vite gives every chunk a content hash, and a GitHub Pages deploy replaces the
// whole site — the previous build's hashed files are deleted, not kept
// alongside. A tab still executing an older index-*.js therefore holds hard
// references to chunk URLs that no longer exist. The main bundle keeps working
// because it is already in memory; only the *lazy* chunks break, and only at
// the moment something first needs one. That is why a stale build looks
// perfectly healthy right up until someone taps Export, and why every Excel
// export failed at once while the Issue Trends export (SheetJS, statically
// bundled) kept working.
//
// The service worker is supposed to prevent this by keeping the whole build in
// sync, and registerType "prompt" asks before swapping versions. But when the
// update prompt never fires — the reported device sat through a logout, a
// refresh and a fresh login with no banner — there is no way out from inside
// the app. Reloading does not help either: the stale index-*.js is what the
// cache keeps handing back.
//
// So recovery is done here instead, at the one place that can actually detect
// the condition: the failed import itself. A chunk that 404s is proof that this
// device's build no longer matches the server's, which is exactly the signal
// the update check failed to produce.

const RECOVERY_FLAG = "rotech_chunk_recovery";

// Set by UpdateBanner once useRegisterSW has a registration. Calling this is
// preferred over clearing caches by hand because vite-plugin-pwa's own
// updateServiceWorker() knows how to activate a waiting worker for the
// "prompt" registerType.
let updateServiceWorker = null;

export function registerServiceWorkerUpdater(fn) {
  updateServiceWorker = fn;
}

/** Thrown when a chunk is still unreachable after a recovery attempt. */
export class StaleBuildError extends Error {
  constructor(cause) {
    super(
      "This device is running an out-of-date copy of the app and could not update itself. "
      + "Close the app completely (swipe it away, don't just switch apps) and reopen it. "
      + "Your work is saved on this device and will still be here."
    );
    this.name = "StaleBuildError";
    this.code = "app/stale-build";
    this.cause = cause;
  }
}

// Browsers word this differently and none of them give a machine-readable code.
// The last pattern covers the case where a service worker answers a missing
// .js request with its navigateFallback index.html: the fetch succeeds, then
// the module parse fails on the MIME type instead.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,  // Chrome, Edge
  /error loading dynamically imported module/i,    // Firefox
  /Importing a module script failed/i,             // Safari
  /is not a valid JavaScript MIME type/i,          // HTML served in place of JS
];

export function isChunkLoadError(error) {
  const message = String(error?.message || error || "");
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

// Cache Storage only holds fetched build assets. Drafts, saved visits and PDF
// history are in localStorage (see DRAFT_KEY / VISITS_KEY in App.jsx), which is
// a separate store and is deliberately left alone — clearing these caches
// cannot lose a specialist's work.
async function clearAssetCaches() {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  } catch {
    // Storage can be denied (private mode, evicted quota). Reloading without
    // the clear is still worth attempting.
  }
}

/**
 * Attempt to get this device onto the deployed build, then reload.
 *
 * Returns only if recovery was already tried this session; otherwise the page
 * navigates away and nothing after the call runs.
 */
async function recoverFromStaleBuild() {
  let alreadyTried = false;
  try {
    alreadyTried = sessionStorage.getItem(RECOVERY_FLAG) === "1";
  } catch {
    // sessionStorage unavailable. Treat as "already tried" rather than risk an
    // unbounded reload loop we would have no way to detect.
    alreadyTried = true;
  }
  if (alreadyTried) return false;

  try {
    sessionStorage.setItem(RECOVERY_FLAG, "1");
  } catch {
    return false;
  }

  // This is the load-bearing step. Emptying Cache Storage is what forces the
  // reload below to go to the network for index.html and its chunks; the
  // service worker swap under it is a bonus, not the mechanism.
  await clearAssetCaches();

  if (updateServiceWorker) {
    try {
      // Activates a waiting worker and reloads. But the device that prompted
      // this had no waiting worker at all — that is why no update banner ever
      // appeared — and the call can then resolve without navigating. Racing a
      // deadline keeps a version that neither navigates nor rejects from
      // parking the caller on a page that will never reload.
      await Promise.race([
        updateServiceWorker(true),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Fall through to the reload below.
    }
  }

  // Unconditional: if updateServiceWorker already navigated, this never runs.
  window.location.reload();
  return true;
}

/**
 * Load a lazy chunk, healing a stale build rather than failing in front of the
 * user.
 *
 *   const JSZip = (await importChunk(() => import("jszip"))).default;
 *
 * On the first chunk failure of a session this clears the asset caches,
 * activates any waiting service worker and reloads — the export the user asked
 * for is lost, but the tap that follows works instead of failing forever.
 *
 * The session flag bounds that to a single reload. If a chunk is still missing
 * afterwards the build on the server is genuinely broken, and a reload loop
 * would be far worse than an honest error, so the second failure throws
 * StaleBuildError.
 */
export async function importChunk(load) {
  try {
    const chunk = await load();
    // Getting here means this build's chunks resolve, so a later deploy is
    // allowed its own recovery attempt.
    try { sessionStorage.removeItem(RECOVERY_FLAG); } catch { /* not fatal */ }
    return chunk;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;

    console.error("Lazy chunk failed to load; attempting to recover.", error);
    const recovering = await recoverFromStaleBuild();
    if (recovering) {
      // The page is reloading. Keep the caller parked rather than letting it
      // fall into a catch block and alert() over a page that is going away.
      await new Promise(() => {});
    }
    throw new StaleBuildError(error);
  }
}

/**
 * The message an export's catch block should show.
 *
 * A stale build has nothing to do with the workbook, so the usual
 * "password-protected or unsupported format" guess would send someone looking
 * in the wrong place entirely.
 */
export function exportFailureMessage(error, fallback) {
  if (error instanceof StaleBuildError) return error.message;
  return `${fallback}\n\n${error.message}\n\n(Full details logged to the browser console — press F12.)`;
}
