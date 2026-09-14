// Why a cloud save failed, in words a specialist in the field can act on.
//
// Every save path in App.jsx used to end in a bare `catch {}`: the error object
// was discarded, the banner said only "Not syncing to the cloud", and there was
// no way — from the app, or afterwards from the Firebase console — to tell
// which of a dozen unrelated causes had actually fired. This module keeps the
// error and turns it into a cause plus a next step.

// Firestore's hard per-document ceiling. Not a quota and not configurable:
// a write over this is rejected outright.
export const FIRESTORE_DOC_LIMIT = 1048576;

// Leave headroom. A visit is merged with the copy already in the cloud before
// it is written (mergeVisitForWrite), so the document this device is holding is
// usually a little smaller than the one that actually gets sent.
export const SAFE_DOC_LIMIT = Math.floor(FIRESTORE_DOC_LIMIT * 0.85);

const utf8 = (s) => new TextEncoder().encode(String(s)).length;

/**
 * Firestore's own storage accounting, which is NOT the same as JSON length.
 *
 * Per Google's documented rules: a string costs its UTF-8 bytes + 1, but every
 * number costs a flat 8 bytes, a boolean 1, null 1; a map costs the sum of
 * (field name + 1) plus its values; and a document carries 32 bytes of
 * overhead on top of its name.
 *
 * The difference matters here rather than being pedantry. Parsed spreadsheet
 * cells are largely numbers, and JSON.stringify writes those as 1–3 characters
 * while Firestore charges 8 bytes each — so a JSON measurement can report a
 * document comfortably under the limit that Firestore then rejects for being
 * over it. Measuring the wrong thing is how an oversize document hides.
 */
export function fieldValueBytes(value) {
  if (value === null || value === undefined) return 1;
  switch (typeof value) {
    case 'string': return utf8(value) + 1;
    case 'number': return 8;
    case 'boolean': return 1;
    case 'bigint': return 8;
    default: break;
  }
  if (value instanceof Date) return 8;
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) total += fieldValueBytes(item);
    return total;
  }
  if (typeof value === 'object') {
    let total = 0;
    for (const [k, v] of Object.entries(value)) total += utf8(k) + 1 + fieldValueBytes(v);
    return total;
  }
  return 1;
}

/** Full document size as Firestore counts it, including name and overhead. */
export function estimateFirestoreBytes(doc, docPath = '') {
  return utf8(docPath) + 1 + fieldValueBytes(doc) + 32;
}

/**
 * Kept as the name the rest of the app calls, now backed by Firestore's real
 * accounting rather than JSON length.
 */
export function measureBytes(value) {
  try {
    return fieldValueBytes(value);
  } catch {
    return 0;
  }
}

/**
 * Per-field byte sizes, largest first. When a visit is too big to store, this
 * is what makes it actionable — it names the section that has to be trimmed
 * or re-uploaded rather than leaving the specialist to guess.
 */
export function largestFields(visit, take = 4) {
  if (!visit || typeof visit !== 'object') return [];
  return Object.entries(visit)
    .map(([key, value]) => ({ key, bytes: measureBytes(value) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, take);
}

export function formatBytes(n) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}

/**
 * Everything Firestore refuses to store, with the exact path to it.
 *
 * `invalid-argument` is the least useful error Firestore returns: it covers a
 * dozen unrelated defects and names none of them. These are the ones this
 * visit payload can realistically contain:
 *
 *  - undefined values. mergeVisitForWrite guards its top-level assigns, but
 *    preferLocal() returns `remoteVal` whenever the local value is blank — and
 *    that is itself undefined when the key exists on neither side, so a nested
 *    undefined slips through into a merged answer map.
 *  - nested arrays. Workbooks are parsed with sheet_to_json(ws, { header: 1 }),
 *    which yields an array of row arrays; stored inside another array that is
 *    an array-of-arrays, which Firestore rejects outright.
 *  - non-finite numbers, which JSON.stringify silently turns into null.
 *  - reserved __field__ names, empty field names, and maps nested past 20 deep.
 */
export function findFirestoreProblems(value, { maxDepth = 20, limit = 25 } = {}) {
  const problems = [];

  const walk = (node, path, depth, insideArray) => {
    if (problems.length >= limit) return;

    if (node === undefined) {
      problems.push({ path, problem: 'is undefined — Firestore cannot store undefined values' });
      return;
    }
    if (typeof node === 'number' && !Number.isFinite(node)) {
      problems.push({ path, problem: `is ${String(node)}, which cannot be stored` });
      return;
    }
    if (typeof node === 'function' || typeof node === 'symbol') {
      problems.push({ path, problem: `is a ${typeof node}, which cannot be stored` });
      return;
    }
    if (node === null || typeof node !== 'object' || node instanceof Date) return;

    if (depth > maxDepth) {
      problems.push({ path, problem: `is nested more than ${maxDepth} levels deep` });
      return;
    }

    if (Array.isArray(node)) {
      if (insideArray) {
        problems.push({ path, problem: 'is an array directly inside another array — Firestore does not support nested arrays' });
        return;
      }
      node.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1, true));
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === '') {
        problems.push({ path, problem: 'has a field with an empty name' });
        continue;
      }
      if (/^__.*__$/.test(key)) {
        problems.push({ path: `${path}.${key}`, problem: 'uses a reserved __field__ name' });
        continue;
      }
      walk(child, path ? `${path}.${key}` : key, depth + 1, false);
    }
  };

  walk(value, '', 0, false);
  return problems;
}

/** Thrown before a write whose content Firestore is guaranteed to reject. */
export class VisitInvalidError extends Error {
  constructor(problems) {
    super(`Visit contains ${problems.length} value(s) Firestore cannot store.`);
    this.code = 'visit/invalid';
    this.problems = problems;
  }
}

/** Thrown by saveVisitToFirestore before it attempts a write it knows will fail. */
export class VisitTooLargeError extends Error {
  constructor(bytes, fields) {
    super(`Visit document is ${formatBytes(bytes)}, over the ${formatBytes(FIRESTORE_DOC_LIMIT)} limit.`);
    this.code = 'visit/too-large';
    this.bytes = bytes;
    this.fields = fields;
  }
}

const SUPPORT = 'If this keeps happening, send this message to Cody.';

/**
 * Turn a thrown error into { code, title, detail, action }.
 *
 * The codes worth separating here are the ones that never reach the security
 * rules, because those are invisible in the console's Rules charts — a rules
 * "Denies: 0" reading does not mean writes are succeeding, it can equally mean
 * they are being rejected before rules are ever evaluated.
 */
export function describeSaveError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      code: 'offline',
      title: 'This device is offline',
      detail: 'The browser reports no internet connection, so nothing can reach the cloud.',
      action: 'Your work is saved on this device. It will sync once you reconnect — keep the app open.',
    };
  }

  const code = error?.code || '';

  if (code === 'visit/too-large') {
    const worst = (error.fields || [])
      .map(f => `${f.key} (${formatBytes(f.bytes)})`)
      .join(', ');
    return {
      code,
      title: 'This visit is too large to store in the cloud',
      detail:
        `The visit is ${formatBytes(error.bytes)}. Firestore refuses any single document over `
        + `${formatBytes(FIRESTORE_DOC_LIMIT)}, so the whole save is rejected — which is why it worked earlier `
        + 'in the day and stopped once the visit had grown. Largest parts: ' + (worst || 'unknown') + '.',
      action:
        'Your work is saved on this device and is not lost. Finalize this visit, or start a new visit for the '
        + 'remaining sections, rather than adding more to this one. ' + SUPPORT,
    };
  }

  if (code === 'visit/invalid') {
    const list = (error.problems || []).slice(0, 3)
      .map(p => `${p.path || '(root)'} ${p.problem}`)
      .join('; ');
    const extra = (error.problems || []).length > 3
      ? ` …and ${error.problems.length - 3} more.`
      : '';
    return {
      code,
      title: 'This visit contains something the cloud cannot store',
      detail: `Firestore refuses these values: ${list}.${extra}`,
      action:
        'Your work is saved on this device and is not lost. Send this message to Cody — it names the exact '
        + 'fields, which is what the fix needs.',
    };
  }

  if (code === 'invalid-argument') {
    return {
      code,
      title: 'The cloud rejected this visit as invalid',
      detail:
        'Firestore refused the document itself — either it is over the 1 MB per-document limit, or a field '
        + 'holds a value it cannot store (an undefined value, or an array directly inside another array). '
        + 'This is rejected before the security rules run, so it never appears as a "deny" in the Firebase '
        + 'console.',
      action: 'Your work is saved on this device. Send this message to Cody. ' + SUPPORT,
    };
  }

  if (code === 'permission-denied') {
    return {
      code,
      title: 'The cloud refused this save',
      detail:
        'The security rules rejected the write. Visits are owned by the account that created them, so this '
        + 'happens if the visit belongs to a different sign-in than the one currently active on this device.',
      action: 'Sign out and sign back in, then press Save Progress again. ' + SUPPORT,
    };
  }

  if (code === 'unauthenticated') {
    return {
      code,
      title: 'Your sign-in has expired',
      detail:
        'The cloud no longer recognises this session, even though the app still looks signed in. Rules are '
        + 'never reached in this case, so nothing shows as denied in the console.',
      action: 'Sign out and sign back in. Your work is saved on this device and will still be here.',
    };
  }

  if (code === 'not-found') {
    return {
      code,
      title: 'The cloud database could not be found',
      detail:
        'The app is pointed at a Firestore database that does not exist. This project uses a named database '
        + '("surveyprep") rather than the default one, and a build that loses that name fails exactly like this.',
      action: 'This needs a code or config fix — send this message to Cody.',
    };
  }

  if (code === 'unavailable' || code === 'cloud/timeout') {
    return {
      code: code === 'cloud/timeout' ? 'cloud/timeout' : 'unavailable',
      title: 'Could not reach the cloud database',
      detail:
        'The request never got a reply. Usually a dropped connection, hotel or clinic wifi that needs a login, '
        + 'or a corporate firewall or VPN blocking Firestore.',
      action:
        'Your work is saved on this device. Try a phone hotspot — if that works, the site network is blocking it.',
    };
  }

  if (code === 'resource-exhausted') {
    return {
      code,
      title: 'The database is over its daily limit',
      detail: 'The Firebase project has hit a quota and is refusing writes for everyone until it resets.',
      action: 'Your work is saved on this device. ' + SUPPORT,
    };
  }

  return {
    code: code || 'unknown',
    title: 'Could not save to the cloud',
    detail: error?.message || 'Firebase did not say why.',
    action: 'Your work is saved on this device. ' + SUPPORT,
  };
}
