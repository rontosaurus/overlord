# Roadmap

The spine of this repo. Read it, then read the one spec you are executing.

## Status

| Phase | Spec | Status | Last touched |
|---|---|---|---|
| 01 Inventory what runs in my home lab | [`specs/01-example.md`](specs/01-example.md) | not started | YYYY-MM-DD |
| <next phase> | `specs/<NN>-<name>.md` | | |

## Decision log

**Only the owner (<your-name>) amends this table.** Agents may *propose* a decision in a spec's Log;
they never add, edit or remove a row. A LOCKED decision is never reopened or worked around — if a
step cannot proceed as written, log the blocker and stop.

| # | Decision | Why | Date | LOCKED? |
|---|---|---|---|---|
| | | | YYYY-MM-DD | |

## How a spec works

Each spec has a `Status:` line, a numbered list of Steps, a dated Log, and an "Attestations this
phase must prove" table. A phase is not complete until its named attestations pass when re-run.
