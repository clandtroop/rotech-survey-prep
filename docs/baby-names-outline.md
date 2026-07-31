# Baby Name Board — design outline

Proposal for a shared baby-name list with a real ranking system and link-based
voting. Nothing is built yet; this is the plan to react to. Written against
this repo's existing patterns (React + Vite + Firestore `surveyprep`, public
share links, QR codes, XLSX/PDF export) so it can reuse them rather than
inventing a second way to do everything.

Everything below is a default I picked so there's something concrete to argue
with. §10 lists the decisions I'd want from you before writing code.

## 0. One thing worth flagging first

This is personal data (a family's baby names, and possibly relatives' votes)
living in the company Rotech Firebase project and shipping inside the Survey
Prep PWA. That's fine for a scratch build, but it means anyone with Firebase
console access to the project can read it, and a stray nav card could put it
in front of coworkers. Two mitigations, in order of preference:

1. **Separate deployment** — same code, its own repo + Firebase project. Costs
   an afternoon of setup, removes the problem entirely.
2. **Unlisted route in this app** — `?names=<boardId>`, no nav entry, no
   dashboard card, board IDs unguessable. Nobody stumbles into it, but it is
   still the company project underneath.

The outline below works either way; it's written for option 2 since that's the
fastest path, and option 1 is a lift-and-shift from there.

## 1. Product shape

A **board** is one family's name list. It has an owner (you), a set of
**voters**, and a set of **names**.

- Owner creates the board while signed in, gets a link + QR code.
- Voters open the link, type a display name once, and start voting. No account,
  no password — the same trick `?checklist=<visitId>` already uses for location
  managers (`src/App.jsx:2913`). Identity is a random `voterId` in
  `localStorage`, so the same phone keeps the same ballot.
- Two board modes:
  - **Private** (default) — just the parents. Every vote is visible to the
    other once cast.
  - **Open** — grandparents, siblings, friends. Their votes are collected but
    weighted separately and never override the parents (see §3.4). This is the
    difference between "fun input" and "my mother-in-law picked the name."

## 2. Voting mechanics

The single most common failure of a name app is a 1–5 star rating on 300
names: everyone rates everything 4 or 5, the average compresses into a band of
0.3, and you learn nothing. So: **two phases with different instruments.**

### Phase 1 — Triage (fast, one pass over the whole list)

One name on screen at a time, four buttons (swipeable on mobile):

| Vote | Meaning | Weight |
| --- | --- | --- |
| ❤️ Love | shortlist it | +2 |
| 👍 Maybe | wouldn't object | +1 |
| 👎 No | don't like it | 0 |
| 🚫 Veto | hard block, never show me again | kills the name |

Purpose is cutting 300 names to ~40. Fast, low-commitment, and the veto is the
feature people actually want — either parent can permanently kill a name
without a conversation about it.

**Veto budget.** Each voter gets a fixed number of vetoes (default 10,
owner-configurable). Without a budget, veto becomes the only button anyone
presses. With one, spending a veto means something. Vetoes are refundable —
you can take one back and get the credit returned.

**Blind until voted.** A name's existing scores are hidden until you have voted
on it. Anchoring is real: seeing "your partner loved this" before you decide
changes your answer. After you vote, everything is revealed.

### Phase 2 — Head-to-head (produces the actual ranking)

Once a name survives triage, ranking it against other survivors is a pairwise
question: "Eleanor or Beatrice?" Two names, pick one, or Skip. This is where
the real order comes from, because people can compare two things far more
reliably than they can assign an absolute score.

- Only names that survived triage (no veto, ≥1 Love/Maybe) enter the pool.
- Pairs are chosen to maximise information: prefer names with close current
  ratings and low comparison counts, never repeat a pair for the same voter,
  never pair a name against itself.
- ~n·log(n) comparisons gets a usable order — around 200 comparisons for 40
  names, which is a few minutes of thumb-tapping split across two people, not
  a chore.
- Phase 2 is optional. A board that only ever does triage still ranks fine by
  the Phase 1 score; head-to-head just sharpens the top.

## 3. The scoring math

Spelled out because "ranking system" is the part that's easy to hand-wave.

### 3.1 Triage score

Per voter, per name: `love = 2, maybe = 1, no = 0`. A name's triage score is
the sum across parent voters, normalised to 0–100 by dividing by the maximum
possible (2 × number of parents).

### 3.2 Head-to-head rating (Elo)

Every name starts at **1500**. After each comparison:

```
expected_A = 1 / (1 + 10^((rating_B - rating_A) / 400))
rating_A' = rating_A + K · (result_A - expected_A)     // result: 1 win, 0 loss
rating_B' = rating_B + K · (result_B - expected_B)
```

`K = 32` early (< 10 comparisons for that name), dropping to `K = 16` after,
so ratings settle instead of oscillating. Skips update nothing.

Elo over a full Bradley–Terry fit because it's ~15 lines, updates live as you
tap, and with these sample sizes the difference in the final order is noise.

**Ratings are per voter.** One Elo table per person, merged at display time
(§3.4). A shared table would let whoever votes most drive the ranking, and
would hide exactly the disagreement you want to see.

### 3.3 Combined score

```
score = 0.35 · triage_normalised + 0.65 · elo_normalised
```

Elo is normalised across the board's current min/max rating. Before a name has
any comparisons it scores on triage alone, so the list is useful from the first
vote. Weights are constants in one place, easy to retune.

### 3.4 Agreement, which is the number that actually matters

A name averaging 70 because both parents said 70 is a completely different
thing from a name averaging 70 because one said 100 and the other said 40.
Every name carries three numbers, and the list can sort by any of them:

- **Average** — mean parent score. The optimistic view.
- **Consensus** — the *minimum* parent score. A name is only as good as the
  least enthusiastic parent, and this is the honest way to pick a name two
  people have to live with. **Default sort.**
- **Spread** — max − min. High spread names get a "⚡ Split" badge and their
  own view, because those are the conversations worth having.

Open-mode voters (grandparents, friends) are pooled into a separate
**Crowd** score, always displayed alongside but never inside the parent
consensus. It can break ties and it can be sorted by, and that's all.

### 3.5 Mutual matches

The headline view: names where **every parent said Love or Maybe, and nobody
vetoed**, sorted by consensus. This is what people open the app to see. Give
it a real moment in the UI — a card, a count, a small celebration when a new
match appears.

## 4. Data model (Firestore)

Five collections, following the naming and shape conventions already in
`firestore.rules`. All in the named `surveyprep` database (`src/firebase.js`).

### `nameBoards/{boardId}`

`boardId` is a 20-char random string — the unguessable link, same posture as
`followUpChecklists`.

```js
{
  title: "Baby Girl Landtroop",
  ownerUid, ownerEmail,
  mode: "private" | "open",
  dueDate: "2026-11-14",          // optional, drives a countdown
  vetoBudget: 10,
  phase: "triage" | "headToHead" | "final",
  surname: "Landtroop",           // for the full-name preview, §7
  siblings: ["Owen"],             // sibling-fit check
  createdAt, updatedAt,
}
```

### `nameBoards/{boardId}/names/{nameId}`

```js
{
  name: "Eleanor",
  gender: "f" | "m" | "neutral",
  origin: "Greek", meaning: "bright, shining one",
  nicknames: ["Nora", "Ellie", "Nell"],
  ssaRank2024: 14,                // null for names not in the SSA data
  addedBy: voterId, addedByName: "Cody",
  status: "active" | "vetoed" | "shortlist" | "eliminated",
  createdAt,
}
```

### `nameBoards/{boardId}/voters/{voterId}`

```js
{ displayName: "Cody", role: "parent" | "crowd", joinedAt, lastSeenAt }
```

Role is set by the owner (or by the link they used — see §10 Q4). Voters
cannot promote themselves.

### `nameBoards/{boardId}/votes/{voterId}_{nameId}`

Deterministic ID, so a re-vote overwrites instead of duplicating — the same
`${taskId}_${period}` trick `teamPlannerTaskDone` uses.

```js
{ voterId, nameId, vote: "love" | "maybe" | "no" | "veto",
  elo: 1500, comparisons: 12, wins: 8, comment: "reminds me of my aunt",
  updatedAt }
```

Per-voter Elo lives on the vote doc, so one write covers both phases and a
voter's whole ballot is one query.

### `nameBoards/{boardId}/matchups/{matchupId}`

```js
{ voterId, winnerId, loserId, skipped: false, at }
```

Append-only. Kept so ratings can be recomputed from scratch when the formula
changes (it will), and so "you've compared 84 pairs" is real.

## 5. Security rules sketch

The board ID is the credential — same model as `followUpChecklists`, which has
been in production here for a while.

```
match /nameBoards/{boardId} {
  allow read: if true;
  allow create: if request.auth != null
                && request.resource.data.ownerUid == request.auth.uid;
  allow update: if request.auth != null
                && request.auth.uid == resource.data.ownerUid;
  allow delete: if request.auth != null
                && request.auth.uid == resource.data.ownerUid;

  match /voters/{voterId} {
    allow read: if true;
    allow create: if request.resource.data.role == 'crowd'
                  || isOwner(boardId);          // self-signup is crowd-only
    allow update: if isOwner(boardId)
                  || request.resource.data.diff(resource.data)
                       .affectedKeys().hasOnly(['displayName', 'lastSeenAt']);
    allow delete: if isOwner(boardId);
  }

  match /names/{nameId} {
    allow read: if true;
    allow create, update: if true;   // anyone with the link may suggest
    allow delete: if isOwner(boardId);
  }

  match /votes/{voteId} {
    allow read: if true;
    // voteId is `${voterId}_${nameId}` — you can only write your own ballot
    allow create, update: if voteId.split('_')[0] == request.resource.data.voterId;
    allow delete: if false;
  }

  match /matchups/{matchupId} {
    allow read: if true;
    allow create: if true;
    allow update, delete: if false;
  }
}
```

Honest limits: with an open link, a voter ID is self-asserted, so anyone with
the link could forge another voter's ballot if they tried. For a family name
board that's an acceptable trade — the same one the follow-up checklists
already make. If it isn't, Firebase **anonymous auth** upgrades this to a real
per-device identity (`request.auth.uid == voterId`) for maybe an hour of work,
and I'd suggest doing that if the link ever goes beyond immediate family.

## 6. Screens

Six, following the app's existing card/rail visual system (`src/theme.jsx`).

1. **Board home** — mutual-match count, phase progress ("you've voted on
   112 / 300"), leaderboard top 10, "Keep voting" CTA, share link + QR.
2. **Triage** — one big name card: name, meaning, origin, nicknames, SSA
   popularity rank, full-name preview. Four vote buttons. Undo. Progress bar.
   Keyboard: ←/→/↑/↓ so a laptop pass is fast.
3. **Head-to-head** — two cards side by side (stacked on mobile), pick one or
   Skip, comparison counter.
4. **Rankings** — the sortable list. Columns: rank, name, consensus, average,
   spread, per-voter chips, badges (⚡ Split, 🚫 Vetoed, ⭐ Match). Filters by
   gender, letter, syllables, popularity band, status.
5. **Add names** — free text (comma or newline separated, bulk paste), plus
   browse-the-catalog with filters (§8).
6. **Owner settings** — voters and their roles, veto budget, phase, mode,
   export, delete board.

## 7. Details that make it feel finished

Cheap to build, and they're what turn a spreadsheet into something people use.

- **Full-name preview** — "Eleanor Grace Landtroop" rendered large on the
  triage card. Reading it out loud is how people actually decide.
- **Monogram / initials check** — flags unfortunate initials (`A.S.S.`,
  `P.M.S.`, `K.K.K.`) before anyone gets attached.
- **Rhyme & alliteration warning** — surname-rhyming or same-initial pairings
  get a gentle note, not a block.
- **Sibling fit** — shows the name next to existing siblings so the set reads
  as a set.
- **Soundalike / duplicate detection** — Metaphone or Levenshtein so
  "Katelyn / Caitlin / Kaitlynn" collapse into one entry with spelling
  variants instead of three rows splitting the vote.
- **Popularity band** — SSA rank shown as Top 10 / Top 100 / Top 1000 / Rare,
  with a 10-year trend sparkline. "Is this about to become the new Emma?" is
  a real question and the data answers it.
- **Comments per name** — one line each ("my grandmother's name"). Context
  changes votes more than scores do.
- **Activity feed** — "Sarah voted on 40 names", "New match: Beatrice ⭐".
- **Shortlist lock** — freeze a final 5 and stop accepting new names, so the
  list converges instead of growing forever.
- **Export** — XLSX and PDF of the rankings, reusing the export helpers already
  in `TrendDashboard.jsx`.
- **Reveal card** — a clean shareable image of the final pick.

## 8. Where the names come from

Runtime is a static GitHub Pages PWA with no backend, so no live API. Bundle
the data instead: the **SSA national baby-name data is US public domain**, and
the top ~2,000 names per gender with rank + 10-year history is roughly a
150 KB JSON — small enough to ship, lazy-loaded on the Add Names screen so it
never touches the main bundle.

Meanings, origins and nicknames aren't in the SSA data and don't have a clean
free source. I'd hand-curate those for the top few hundred names and leave the
field blank elsewhere rather than scrape something of unknown provenance and
license. A blank meaning is better than a wrong one.

## 9. Build phases

| Phase | Scope | Rough size |
| --- | --- | --- |
| 1 | Board CRUD, add names, triage voting, mutual-match view, share link + QR | ~1 day |
| 2 | Head-to-head + Elo, rankings table with consensus/spread, filters | ~half day |
| 3 | SSA catalog, meanings, popularity sparkline, soundalike merge | ~half day |
| 4 | Polish: initials/rhyme checks, comments, activity feed, export, reveal card | ~half day |

Phase 1 alone is genuinely usable — the rest sharpens it.

## 10. Open questions

1. **Where does it live?** Unlisted route in this app (fast) or its own
   repo + Firebase project (clean)? See §0.
2. **How many voters?** Two people, or a wider family group? Two-person boards
   could skip triage entirely and go straight to head-to-head; large groups
   need the crowd/parent split to be airtight.
3. **How many names, and where do they start?** An existing list to import, or
   starting from the catalog?
4. **Two links or one?** A single link where the owner assigns roles, or a
   separate parent link and crowd link so role is implicit in which one you
   were sent?
5. **Should crowd voters see the rankings**, or only submit into the void?
   Hiding results from them removes a whole category of family awkwardness.
6. **Anonymous or attributed votes** among parents? Attributed is more useful
   (that's what consensus and spread are built on) but there's a case for
   hiding who vetoed what.
7. **Gender** — one board covering both, two separate boards, or unknown-sex
   with a neutral list?
