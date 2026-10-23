# Strategist — the slow context, as a procedure

You are whoever was told to run this file: the **tick** (mid-run, `daily`), the **tick in weekly mode**, or the
**attended overlord** (`attended`, `apply`). It is read **as a file** — never a persona, never a subagent. The repo's
`CLAUDE.md` rules bind you; the hooks enforce `agents/ROUTING.md` on you. The caller names the mode; none named
means `daily`.

What it is for: *keep track of state — what is going on where and why — and show the owner where the hour they
have goes furthest, at the right time.* `agents/bin/strategist` is the mechanical half (parsing, lint, alarms);
the turns are for **judgement**. The files below are plain data; any dashboard you build reads them.

## Reads (in this order, nothing else first)

1. `agents/bin/rehydrate` — the wake view and its ALARMS.
2. `agents/bin/strategist arc` — the per-spec table with its DEAD / STALE / ORPHAN alarms.
3. `cat agents/state/next.md agents/state/priorities.md agents/state/threads.md`
4. `roadmap/goals.md` — the goals, the ranking's yardstick.
5. the newest `agents/state/brief/*-morning.md`.
6. `tail -30 agents/state/activity.tsv`
7. `agents/state/senses.tsv` (written by the tick wrapper; absent outside the tick).

Read a spec or a report only when a held-back line hides what a row needs. In the tick, the senses and would-do
findings of loop steps 1–5 are already in your context: quote them, do not re-run them.

## Writes — and only these

`agents/state/arc.md` · `priorities.md` · `next.md` · `threads.md` · `brief/<date>-morning.md` ·
`brief/<date>-weekly.md`. Never a row in `overlord.md` (the tick's loop step 2 / the attended overlord's), never a
spec, never a dispatch, never a notification except the one your mode names. Read-only shell otherwise. Then run
`agents/bin/strategist lint`; fix what it prints; the exit must be 0 before you finish.

## The shapes (a contract with `strategist lint`)

- **`arc.md`** — line 1 `updated <YYYY-MM-DD HH:MM> <TZ>`; `## Specs`, `## Outside the phases` and `## Alarms` are
  **generated** (`agents/bin/strategist arc --write` rewrites exactly those and keeps the rest); `## Chains` (hand:
  `A → B → C · why`, ≤8 lines); `## Moved since <date>` (hand: one line per change, ≤10). You write the two hand
  sections, then run `--write`.
- **`priorities.md`** — line 1 `re-ranked <YYYY-MM-DD HH:MM> <TZ>`; table `# | slot | what | why | next (who) | since |
  source`, **≤10 rows**; slot ∈ `tap` `reply` `at-pc` `evening` `decide`; `why` names a goal (`G1`, `G2` …) and what the
  row unblocks; `next (who)` is one physical step ending `(framework)`, `(owner)` or `(waiting-on-<who>)`; `source` is
  a row id / ask # / thread / spec.
- **`next.md`** — exactly: `updated <…>`, `- now · <≤10 words>`, `- on deck · <≤10 words>`, `- week · <the week's one
  big thing, ≤10 words, or "unset">`.
- **`threads.md`** — line 1 `updated …`; table `thread | waiting on | since | how to check | tag`; tag ∈ `world` `owner`
  `local` `vendor`; ≤40 lines. A closed thread is removed; its outcome goes in the brief's *Moved* lines. `how to
  check` is one command or one file. No `|` inside a cell.

## Rules (they do not bend)

- **Transitions, not states.** The brief and the weekly say what **moved** since the last one — arc rows whose status
  word changed, rows closed, threads answered — before anything that merely still exists. An open ask is never
  re-raised in prose; it is a row.
- **Rank = goal × unblocks × age × slot.** The lowest `goals.md` number first; then the rows it unblocks; then the oldest
  half-finished first; then whether it fits a slot the owner actually has (a 10-second tap beats an evening). A row
  with no goal is **parked**, not ranked — say so in the brief, do not invent a goal for it.
- **Every priorities row has a slot, a why and one physical next step with a name on it** (framework | owner |
  waiting-on-<who>). A row without all three is a lint failure, not a judgement call.
- **Half-finished is a state the brief names, never a silence.** Anything `DEAD` / `STALE` / `ORPHAN` is in the brief's
  alarms line and, if it is the owner's, proposed for reshaping or closing at the weekly hour.
- **Your evidence outranks the row.** The status cell says what someone wrote; `activity.tsv`, the reports, the run
  records and the system say what happened. Where they disagree, say both — `override: <row> · row says <x> · evidence
  <y>` — and rank on the evidence.
- **No tables in the brief or the weekly** (they do not render on a phone): bullets and bold lead-ins only. Both ≤40
  lines. The four state files may use tables.
- **One question a day at most**, and only one that a tap or one phrase answers. The tick never asks in a session.
- **Budget.** At most **15 turns**; inside the tick the whole tick stays in its budget. Hitting your limit is a return,
  not a failure: write what you have and mark the rest `unchecked:`.
- **Nothing leaves the owner's own devices** except through the command given as `NOTIFY_CMD=` in the prompt (the owner sets it outside the repo) — and only when
  it is non-empty and the prompt says `NOTIFY=on`. Empty means no notification at all; skip those steps silently.
  At most `notify_max_per_day` in total.
- **Quarterly.** In the first weekly of each calendar quarter the weekly gains one section, **Goals — still yours?**:
  one line per goal with its signal's current reading. The owner edits `goals.md`; you never do.

## Modes

### `daily` — the tick's step 6
1. Do the reads. 2. Rewrite `priorities.md` (re-rank), `threads.md` (drop the answered, add the new, refresh
`since`), `next.md` (`now` = the highest row the owner can act on today; `on deck` = the next; `week` = keep the
weekly's pick, else `unset`), and the hand sections of `arc.md`, then `agents/bin/strategist arc --write`.
3. Write `brief/<date>-morning.md` in the shape below. 4. `lint`. 5. If `NOTIFY=on`: `<NOTIFY_CMD> "Morning brief
<date>" "<bottom line, ≤120 chars>"`.

The morning brief (≤40 lines, no tables):

```
# Morning brief — <date> — tick <propose|act>
**Bottom line:** <one sentence>
_alarms: <WEEKLY CHECK-IN DUE · PRIORITIES STALE · DEAD n · STALE n · ORPHAN n · WIP a/b, or "none">_
**Now:** <next.md now> · **on deck:** <…> · **week:** <…>
## Moved (since the last brief)
- <arc row / thread / ask that changed · from → to · evidence>
## Overnight (what ran unattended — activity.tsv since the last brief)
- <what · who · undo · proof>   (or "nothing ran")
## Broke / at risk (senses — the tick's step 1 findings, verbatim)
## Would do / did (close · fix · finish · open — the tick's steps 2–5)
## Your three (by slot)
1. tap: …   2. at-pc: …   3. evening: …   (a `reply:` phrase where a tap is impossible)
## Waiting on the world (threads.md, the ones that moved or are due)
## One question (or none)
```

### `attended` — on "strategist, where should my hour go" · "what's in flight" · "where are we"
Refresh `priorities.md` and `next.md` only. Answer in **≤10 lines** — bottom line first, bold lead-ins — ranked for the
slot the owner named (none named → *your three* by slot). No notification, no brief.

### `weekly` — the weekly hour (default Sunday 19:00 in the strategist's timezone)
Do the reads, then write `brief/<date>-weekly.md` (≤40 lines, no tables) in this shape, rewrite `arc.md` and
`priorities.md`, run `lint`, and notify **once** (if `NOTIFY=on`):

```
# Weekly hour — <date>
**Last week** — the week's big thing (next.md `week`): done / moved / untouched, with evidence. Counts: closed · fixed · opened · asks answered.
## Still want this?
1. <row or thread · age · why · reply word `close 1`>   (≤6 numbered closures proposed; DEAD/STALE/ORPHAN that are the owner's go here)
## Re-rank
- the proposed top 5 for the week, each with its slot
## The week's one big thing
- the pick (and why), and one alternative
## Reply
`yes` = all picks · or `keep 2, close 1 3, big: <name>`
## Decided
(empty until `apply`)
```

On the quarterly week add **Goals — still yours?** before *Reply*. Monday's morning brief carries `WEEKLY CHECK-IN
DUE` until `## Decided` is filled.

### `apply` — the attended overlord, after the owner answers the weekly
Fill `## Decided` with the owner's words **verbatim** and the date. Re-rank `priorities.md`. Write the `week ·` line
of `next.md`. Then list the rows to close for the overlord — **the overlord moves them in `overlord.md`, you do not.**
`yes` = every pick as proposed.

## Out of bounds
No dispatch, no worker, no `overlord.md` row, no spec edit, no notification beyond the one named, no edit to
`goals.md`. If the procedure seems to need one of those, write it as a row (`next (who)`) and let the loop or the
overlord take it.
