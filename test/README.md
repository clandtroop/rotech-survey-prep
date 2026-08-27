# Firestore security-rules tests

`firestore-rules.test.mjs` runs `../firestore.rules` against the Firestore
emulator. Nothing here touches production — the emulator is a local, in-memory
Firestore seeded with its own fixture data.

The focus is the **follow-up checklist**, which is deliberately reachable with no
login: a location manager just follows the link they were sent. That makes the
rules the only thing standing between a shared URL and the compliance findings
behind it, and those findings name individual employees.

## Running

Requires Java 11+ (the emulator runs on the JVM).

The `xlsx` dependency is served from `cdn.sheetjs.com` rather than the npm
registry, which some corporate proxies block. If `npm install` in this repo
fails on that, run the tests from a scratch directory instead — they only need
three packages and the path to the rules file:

```bash
mkdir /tmp/sp-rules && cd /tmp/sp-rules && npm init -y
npm install firebase-tools @firebase/rules-unit-testing firebase
cp /path/to/rotech-survey-prep/firestore.rules .
printf '{"emulators":{"firestore":{"host":"127.0.0.1","port":8080},"ui":{"enabled":false}},"firestore":{"rules":"firestore.rules"}}' > firebase.json
npx firebase emulators:exec --only firestore --project rotech-survey-prep-test \
  "node /path/to/rotech-survey-prep/test/firestore-rules.test.mjs"
```

Exit code is non-zero if any assertion fails.

## What it covers

| Group | Asserts |
| --- | --- |
| Checklist access | A link-holder can fetch the one checklist their link names; nobody can enumerate the collection without signing in; the visit-id → share-id map is not public |
| Checklist writes | A link-holder can tick items and leave notes, and cannot rewrite or delete the findings, rewrite the metadata, smuggle an extra field alongside a valid tick, post unbounded notes, delete the checklist, or create one |
| Visit trends | Not readable anonymously; only an admin may delete a finalized visit |
| Roster | Not readable anonymously; writable only by the admin allowlist |
| Catch-all | Undeclared collections are closed to everyone |

## Two things worth knowing

**`get` is not `read`.** `allow read` covers *both* `get` and `list`, so
`allow read: if true` on the checklists let anyone dump every checklist for every
location in a single query — no link needed and no id to guess. The rule is split
into `allow get: if true` (the capability URL) and `allow list: if request.auth
!= null` (the specialist roll-up). The test named "checklists CANNOT be
enumerated without the link" is what caught this.

**Completion is stored apart from the findings.** `categories` holds the finding
text; `done` is a separate map keyed by item id. They used to be one array, which
meant ticking a box and rewording a compliance finding were the same write and
the rules could not tell them apart. Keeping them separate is what lets an
unauthenticated visitor tick items without being able to touch the findings.
