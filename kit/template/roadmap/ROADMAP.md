# Roadmap

The spine of this repo. Read it, then read the one spec you are executing.

## Status

| Phase | Spec | Status | Last touched |
|---|---|---|---|
| 01 Inventory what I have, checked against `home-setup.md` | `specs/01-inventory.md` (the overlord writes it) | not started | YYYY-MM-DD |
| <next phase> | `specs/<NN>-<name>.md` | | |

*Phases people start with, as examples: a tested backup restore; naming and documenting the network; a
UPS that shuts things down cleanly; a monitoring check on the thing that bit you last; moving one chore
off your own attention. Suggested default: just row 01 until it is done.*

## Decision log

**Only the owner (<your-name>) amends this table.** Agents may *propose* a decision in a spec's Log;
they never add, edit or remove a row. A LOCKED decision is never reopened or worked around — if a
step cannot proceed as written, log the blocker and stop.

| # | Decision | Why | Date | LOCKED? |
|---|---|---|---|---|
| 1 | *(example)* Backups go to the drive in the hall. | one place to check and to restore from | YYYY-MM-DD | yes |
| 2 | *(example)* Nothing is ever sent to another person without my say-so. | a send cannot be taken back | YYYY-MM-DD | yes |
| 3 | *(example)* I own the router; the assistant only reads it. | an outage there takes the whole home down | YYYY-MM-DD | yes |

*Replace the examples with three of your own; if you have none yet, write those three. A decision is
worth logging when you would be annoyed to see it re-argued.*

## How a spec works

Each spec has a `Status:` line, a numbered list of Steps, a dated Log, and an "Attestations this
phase must prove" table. A phase is not complete until its named attestations pass when re-run.
