# agents/ — the framework, in this repo

The agent framework is a small set of files. The plugin (`hatchery`) supplies the skills, personas
and hooks; this directory holds *your* rules and *your* state.

## Layout

| Path | What it is |
|---|---|
| `ROUTING.md` | The one page every role reads: roles, models, gates (the two lists, hooks H, reviews, class F), verification protocol. **This is what runs.** |
| `estate.env.example` | Copy to `estate.env`. Settings the hooks read (optional secret-manager CLI). The template's `.gitignore` already excludes `agents/estate.env` and `agents/state/sessions/`. |
| `guard.conf.example` | Copy to `guard.conf`. Who must never be messaged (H1), which folders may never be deleted (H4), which provider hosts unattended runs may not call (H4). Each setting carries examples and a suggested default. |
| `bin/drift` | Append one line to `state/drift.log` when a rule was bent or a gate fired (kinds include `waived-F` and `classifier-deny`). |
| `bin/tick`, `prompts/tick.md` | The headless daily governor loop (and `tick weekly`, the strategist hour). Ships in `propose` mode. |
| `bin/strategist`, `prompts/strategist.md` | `arc`, `lint` and `alarms` over the slow-context files (`state/arc.md`, `priorities.md`, `next.md`, `threads.md`). |
| `bin/act` | One activity line (what, undo, proof) per action, into `state/activity.tsv`. |
| `bin/rehydrate`, `bin/archive-state` | The ≤6 KB wake view of `overlord.md` with alarms; lossless trimming of it (dry run by default). |
| `bin/board` | Renders the state files to a local read-only page and `board.json` in `state/board/` (`--band` prints four lines). Tests: `python3 -B bin/test_board.py`. |
| `bin/usage` | API-list-price-equivalent ledger of sessions and subagents in `state/usage.tsv`; `usage session` is the close-out summary. The dollars measure work, not a bill. Tests: `python3 -B bin/test_usage.py`. |
| `bin/rotate`, `bin/carry`, `prompts/rotation.md` | Session rotation: the carry file the next session's start prints. |
| `prompts/debrief.md`, `state/debriefs/` | Five questions (Spent, Friction, Guesses, Rules, Successor) every overlord and overmind session answers at close-out, one file per session. Nobody grades them; the overmind reads them at each review, and two debriefs naming the same friction get an edit. |
| `senses.d/` | Pluggable "what broke" checks the tick runs; each prints TSV finding rows. Its README suggests one for each thing you list in `roadmap/home-setup.md`. |
| `systemd/` | Timer, service and cron examples for the tick. |
| `state/ceiling.json`, `state/strategist.json` | The owner's knobs: daily budget, WIP limit, `tick_mode` (the claude binary and notify command are set in the systemd unit as `HATCHERY_CLAUDE_BIN` / `HATCHERY_NOTIFY_CMD`, not here); strategist timezone and weekly hour. |
| `bin/note-to-overmind` | Append a note to the channel the framework maintainer reads at review. |
| `state/overlord.md` | The overlord's working memory: open initiatives, the Ask-the-owner queue (owner's-hand actions awaiting your go), recently closed, last wake. |
| `state/notes-to-overmind.md` | Append-only channel from the overlord to the maintainer. |
| `state/drift.log` | One line per deviation: `timestamp | kind | initiative | message`. |
| `state/reports/`, `state/briefs/` | Worker reports and the briefs that commissioned them. |

## Setup

The kit's `SETUP.md` session does all of this with you (it sets `AGENTS_REPO`, copies the two
`*.example` files and fills them in from a short interview). By hand: set `AGENTS_REPO` to this repo's
absolute path in Claude Code's settings (`env`) or your shell profile (the `bin/` scripts refuse to run
without it), copy and edit the two `*.example` files, and fill in `roadmap/home-setup.md` (the
overlord's first session asks you for it).

## Acting as the overlord

Start a session in this repo and run `/hatchery:overlord` (or `/overlord`). The overlord reads the
roadmap and `state/overlord.md`, decides what is open, dispatches subagents (scouts, workers,
verifiers, specialists per `ROUTING.md` §2), reruns every Attestation before believing it, and
queues anything irreversible for you under **Ask the owner**. It does not do the work itself.

You decide what happens to each row in the Ask table; the overlord executes a staged irreversible
action only after you say go for that specific row.

## Changing the framework

Changes to `agents/**` are a class F matter (`ROUTING.md` §2): have the design reviewed — on day one
that can be you reading — then edit. Run `/hatchery:overmind` for a review session: it reads
`state/notes-to-overmind.md` after the last review marker, looks at `state/drift.log` and
`state/debriefs/`, and proposes edits to `ROUTING.md` or the personas. A real miss becomes a test case before the persona is edited.
