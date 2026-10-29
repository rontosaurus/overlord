# hatchery — concepts and reference

This is one person's way of letting an AI assistant help run a home network, a few servers and a
pile of small chores without the assistant being able to do anything you cannot take back. It is a
skeleton, not a product. This file is the **reference**: what each term means, what the gates are,
what is in the box, and the technical security notes. To install, start at `START-HERE.md` in the
folder above this one; you do not need this file first.

You do not need any prior AI or agent experience. Every term is explained here, once; other files
link to this one.

## The idea in one paragraph

Claude Code can already read files, run commands and edit things. On its own it has no memory between
sessions and no sense of "this is reversible, that is not." This kit adds three things: **written
rules** (a few plain files it reads every time), **roles** (different helpers for different jobs, so
the one that does the work is not the one that checks the work), and **gates** (small scripts that
refuse certain commands). Everything it knows lives in ordinary files in a git repo, so you can read,
edit and undo all of it. What it knows about *your* home is one file you own, `roadmap/home-setup.md`
(what you have, and what the agents may do with each thing).

## The roles

A "subagent" is a helper Claude spins up for one job, with its own instructions and a limited set of
tools.

- **Overlord** — the one you talk to (`/hatchery:overlord`; that namespaced form is the reliable way
  to invoke it, though bare `/overlord` also works as long as no other installed skill uses that
  name). It delegates and verifies. It reads state, picks the right helper, checks what comes back,
  and writes down what it needs from you. It does not do the work itself.
- **Overseer** — owns one initiative (one project with a start and an end) from plan to report. Here
  the overlord plays this part directly.
- **Specialists** — reviewers that only read and advise: *on-call* diagnoses when something is
  broken; *security* looks for risk in a change; *stakeholder-impact* asks "who in the home will
  notice this, and were they told?"; *optimization* looks for waste and needless cost;
  *design-review* (top-tier model) judges design-level changes.
- **Workers, scouts, researchers, verifiers** — the hands and eyes: a worker makes changes, a scout
  reads, a researcher looks things up, a verifier re-runs checks. With the specialists, that is nine
  subagent personas in `plugin/agents/`; the overlord and overmind are skills, not subagents.
- **Overmind** — reviews the framework itself (`/hatchery:overmind`, or bare `/overmind`), a little
  like a retrospective: what went wrong, which rule was missing, what to change. Run with you, never
  on its own.

The personas read `roadmap/home-setup.md` and `CLAUDE.md` as their local facts, so what they check
follows what you told the overlord you have.

## Gates: two lists and one merge gate

Everything the framework might do is sorted before it happens:

- **Never.** Sends to anyone, a secret value in output or a file, deleting your own data, money,
  editing the decision log. No mode bends these; you do them yourself.
- **Owner's hand.** Irreversible or high-blast-radius: the internet path (firewall, DNS, tunnels,
  TLS), storage layout, host power, git history. The agent stages the exact command. In a session
  you are sitting in, the hook asks you and your answer is the go for that one command; an
  unattended run is refused and leaves it staged for you.
- **Fair game.** Everything else, under three habits: look before you touch, record the undo, log
  it (`agents/bin/act`).

`roadmap/home-setup.md` can only make this stricter: a thing you mark `ask` is owner's hand and a
thing you mark `never` is never, whatever the shipped list says. The full tables, the hooks (H1 to
H7) and the reviews are in `template/agents/ROUTING.md` §2, which is the file that runs; the two
lists are not repeated anywhere else.

The lists are enforced by **hooks**: scripts that run before a command and refuse or ask on a pattern
match, no judgment involved. **Security** is the one review that blocks a merge; the others are habits
the overseer applies itself, with the persona as a second read. A **design review** is required only
for a new service or spec, a decision-log amendment, or a change to the rules themselves.

## Habits worth stealing

- **Attestations.** Every report ends with a table of claims: what was claimed, the command that
  would prove it, and what you should see. "Done" is stated up front and **re-run before it is
  believed**. A claim with no check is labelled unverified.
- **State in files, not in processes.** There is a state file the overlord reads on waking and
  updates on the way out. If the session dies, nothing is lost.
- **Noop is success.** If there is nothing to do, the right output is "nothing to do", not an
  invented task.
- **The framework never picks its own targets.** It works on what you hand it.

## Which model for which job

**Reading is cheap, doing is mid-range, judging is expensive, designing is top.** The table is in
`template/agents/ROUTING.md` §1; a role that has to use a pricier model than its row writes down why.
As orders of magnitude: a cheap-model read costs cents, a mid-model initiative costs low single
dollars, a top-model design review costs $5-15. Claude Code needs a paid Claude plan or an API key.

## What's in the box

Paths here and in `WALKTHROUGH.md` are relative to this `kit/` folder.

- `plugin/` — the Claude Code plugin: the two skills, the nine personas and the hook scripts.
- `template/` — the repo skeleton you copy: `CLAUDE.md` (the rules), `roadmap/` (a one-page roadmap,
  `home-setup.md`, `goals.md`), `agents/` (the routing table, the state files, the governor loop
  `bin/tick` and `strategist`, `act`, `rehydrate`, `archive-state`, the board, and the session tools
  `rotate`, `carry`, `usage`, `drift`). `template/agents/README.md` maps the folder.
- `SETUP.md` — the guided first session (the top-level `CLAUDE.md` points Claude at it).
  `dropin/` — the settings lines it adds, merged next to yours, never over them.
- `WALKTHROUGH.md` — your first hour after setup, what to do later, and how to turn it all off.
- `INTEGRATIONS.md` — what you can point it at, and how an idea becomes a running service.
- `EXAMPLE-INCIDENT.md` — a reconstructed three-day outage, to show what the work looks like.
- `mods/` — optional Claude Code mods, off by default: `overlord-board` draws the board above the
  prompt. Read before loading.

## What runs when

Out of the box nothing runs unless you start it: `/hatchery:overlord` is an interactive delegator
using subagents, and the hooks bind every session once you turn them on. When you have a machine
that stays on, `template/agents/` also carries the **governor loop**: a daily headless tick with a
daily cost ceiling, a WIP limit, pluggable checks in `senses.d/`, and a weekly strategist hour. It
ships in **propose** mode (it writes what it would do and does none of it) until you change
`tick_mode` in `state/ceiling.json`. The rules are `ROUTING.md` §7; the steps to schedule it are
`WALKTHROUGH.md` § Later. Sessions **rotate** instead of growing: at the context-size notice,
`prompts/rotation.md` writes a carry file that the next session's start hook prints.

## Security

The trust model (guard rails, not a vault door; read the hooks before enabling; what leaves your
machine) is in `START-HERE.md` or `LETTER.md`, whichever the folder above has. These are the technical
notes behind it.

- **The plugin's hooks and skills run as you, with your permissions.** Read every file in `plugin/`
  before you enable it. The setup session never turns the plugin on; it lists it as off, walks you
  through the hooks, and leaves the switch to you.
- **Platforms.** Linux is what the hooks were tested on; macOS is untested. On Windows, install Git
  for Windows (the setup offers it and `jq` through `winget`, each behind a prompt). Claude Code's
  docs say Git for Windows is optional, but without it hook commands run under PowerShell, this
  plugin's bash hooks do not run, and **every gate is silently off**. Setup step 7 proves they run
  (`check-gates.sh --live "git push"` with `AGENT_ROLE=overseer` must print BLOCKED); use WSL if Git
  Bash gives you trouble. The session registry (H5) shows nothing on Windows, since it reads `/proc`
  (exactly what it reads is the next-but-one bullet).
  If `check-gates.sh` fails there, the first-hour layer still works: skills and personas need no hooks.
- **Missing pieces turn gates off.** No `jq` means no gates (session start prints a warning); a hook
  script that loses its executable bit is silently off. Check both yourself.
- **What the session hook (H5) reads and writes.** To record which process is your Claude Code session,
  `session-start.sh` walks up the parent chain (at most 12 processes). For each ancestor it reads
  `/proc/<pid>/stat` (the parent pid), `/proc/<pid>/exe` and the first word of `/proc/<pid>/cmdline` (is
  this the claude binary?), and Claude Code's own per-process file `~/.claude/sessions/<pid>.json`: only
  its `sessionId` field, used for one equality test against this session's id. The pid in that path is
  digits only, so it reads one named file per ancestor, never a glob, never a listing of the folder, and
  nothing else in it; it writes nothing there. Its only writes are one small file per session under
  `agents/state/sessions/` in your repo and the removal of entries there whose process is gone or whose
  session id was replaced in the same process (`/clear`, resume). Without `/proc` (Windows) the walk
  cannot climb, so nothing matches and the pid is recorded as 0.
- **H4 only blocks when `AGENT_ROLE` is set** (an unattended run). In your own sessions it asks;
  never-paths block everywhere. That is deliberate: you are the human in the loop. Keep permission
  prompts ON for Bash.
- **Secrets.** Fetch them inside the command, into a variable; never print them or redirect them into
  a file. If you use a password-manager CLI you can configure H2, which catches exactly two things: a
  bare listing command without `jq` (it would print every value), and redirecting or piping a fetched
  value into `cat`, `tee` or `echo`. Printing a value to the terminal is **not** blocked.
- **What the hooks miss.** H4 is common command shapes, not an exhaustive list (other verbs or flags
  for the same action; compound commands whose first part is a pod delete; `find -delete` outside the
  never-paths). H1 sees shell commands and tool calls named `mcp__…` or `WebFetch`, by text, case-
  insensitively, and cannot know what a connector does, so keep your connectors' send tools on "ask".
  H7's shell side is a pattern match (the list of what it misses is in `ROUTING.md`); for real
  protection make the control files read-only to the agent's user.
- **Never run anything headless as root**, or on a machine where your credentials are unlocked.
  Nothing runs unattended until you schedule the tick.
- **Config files** (`agents/estate.env`, `agents/guard.conf`) are parsed as plain `KEY=VALUE` text and
  never executed.
- **Where the gates apply.** The hooks find your rules through `AGENTS_REPO` (the setup puts it in
  Claude Code's settings `env`) or, if that is unset, the folder the session was opened in. Once
  `estate.env` exists and `AGENTS_REPO` is set, the gates apply in every Claude Code session on this
  machine; any folder with an `agents/estate.env` turns them on for sessions opened there. Undo:
  `WALKTHROUGH.md` § Turning it off.
- Cloud sessions (claude.ai/code in the browser) do not load local plugins. Use the terminal, the
  desktop app's local sessions, or VS Code.
