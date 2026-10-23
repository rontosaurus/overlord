# hatchery

This is one person's way of letting an AI assistant help run a home network, a few servers and a
pile of small chores without the assistant being able to do anything you cannot take back. It is a
skeleton, not a product. Read it to see what is possible, then bend it to your own life.

You do not need any prior AI or agent experience. Every term is explained where it first shows up.

## The idea in one paragraph

Claude Code can already read files, run commands and edit things. On its own it has no memory between
sessions and no sense of "this is reversible, that is not." This kit adds three things: **written
rules** (a few plain files it reads every time), **roles** (different helpers for different jobs, so
the one that does the work is not the one that checks the work), and **gates** (small scripts that
refuse certain commands). Everything it knows lives in ordinary files in a git repo, so you can read,
edit and undo all of it.

## The roles

A "subagent" is just a helper Claude spins up for one job, with its own instructions and a limited
set of tools. Here are the roles:

- **Overlord** - the one you talk to (`/hatchery:overlord`; that namespaced form is the reliable way
  to invoke it, though bare `/overlord` also works as long as no other installed skill uses that
  name). It delegates and verifies. It does not do the work itself; it reads state, picks the right
  helper, checks what comes back, and writes down what it needs from you.
- **Overseer** - owns one initiative (one project with a start and an end) from plan to report.
  Here the overlord plays this part directly.
- **Specialists** - reviewers that only read and advise:
  - *on-call* diagnoses when something is broken;
  - *security* looks for risk in a change;
  - *stakeholder-impact* asks "who in the home will notice this, and were they told?";
  - *optimization* looks for waste and needless cost.
- **Workers, scouts, researchers, verifiers** - the hands and eyes: a worker makes changes, a scout
  reads, a researcher looks things up, a verifier re-runs checks. Together with
  design-review (the top-tier reviewer used for design-level changes), that makes nine subagent personas in
  `plugin/agents/`; the overlord and overmind are skills, not subagents.
- **Overmind** - reviews the framework itself (`/hatchery:overmind`; as with the overlord, bare
  `/overmind` also works unless another installed skill uses that name), a little like a
  retrospective: what went wrong, which rule was missing, what to change. It is run with you, never
  on its own.

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

The lists are enforced by **hooks** (H1, H2, H4–H7): scripts that run before a command and refuse or ask on
a pattern match, no judgment involved. **Security** is the one review that blocks a merge; the
other reviewers are habits the overseer applies itself, with the persona as a second read. A
**design review** (top-tier model) is required only for a new service or spec, a decision-log
amendment, or a change to the rules themselves.

H7's shell side is a pattern match, not a sandbox: it misses `git checkout/restore/apply/am`, `curl -o`, `wget -O`, `tar -x`/`unzip`, a path held in a variable, a `cd` first, and anything written from inside an interpreter. For real protection make those files read-only to the agent's user. Do the setup of the unattended tick (the `agents/senses.d/` scripts, the systemd unit or crontab, `ceiling.json`) yourself; keep the unit file and crontab writable only by you.

## Habits worth stealing

- **Attestations.** Every report ends with a table of claims: what was claimed, the command that
  would prove it, and what you should see. "Done" is stated up front and **re-run before it is
  believed**. A claim with no check is labelled unverified.
- **State in files, not in processes.** Nothing lives in a running program's head. There is a state
  file the overlord reads on waking and updates on the way out. If the session dies, nothing is lost.
- **Noop is success.** If there is nothing to do, the right output is "nothing to do", not an
  invented task.
- **The framework never picks its own targets.** It works on what you hand it. It does not go
  looking for things to fix.

## Which model for which job

One line: **reading is cheap, doing is mid-range, judging is expensive, designing is top.** The
table is in `template/agents/ROUTING.md`; if a role ever has to use a pricier model than its row,
it writes down why.

As orders of magnitude: a cheap-model read costs cents, a mid-model initiative costs low single
dollars, a top-model design review costs $5-15. Claude Code needs a paid Claude plan or an API key.

## What is in the box

Paths in this file and in `WALKTHROUGH.md` are relative to this `kit/` folder.

- `plugin/` - the Claude Code plugin: the `/hatchery:overlord` and `/hatchery:overmind` skills, the
  nine personas and the hook scripts.
- `template/` - the repo skeleton you copy: `CLAUDE.md` (the rules), a one-page roadmap, the
  routing table, the state files, the governor loop (`agents/bin/tick`, `strategist`, `act`,
  `rehydrate`, `archive-state`), the work board (`agents/bin/board`) and session tools (`rotate`,
  `carry`, `usage`, `drift`).
- `SETUP.md` - the guided first session (the `CLAUDE.md` one level up points Claude at it): open the
  `hatchery` folder in Claude Code and say "set me up". `dropin/` - the three settings lines it adds, merged next to yours, never over them.
- `WALKTHROUGH.md` - your first hour, and how to turn it all off.
- `EXAMPLE-INCIDENT.md` - a reconstructed three-day outage, to show what the work looks like.
- `mods/` - optional Claude Code mods, off by default: `overlord-board` draws the board above the
  prompt. Read before loading.

## What runs when

Out of the box nothing runs unless you start it: `/hatchery:overlord` is an interactive delegator
using subagents, and the hooks bind every session once you turn them on. When you have a machine
that stays on, `template/agents/` also carries the **governor loop**: a daily headless tick
(`bin/tick`, `prompts/tick.md`) with a daily cost ceiling, a WIP limit, pluggable checks in
`senses.d/`, and a weekly strategist hour. It ships in **propose** mode: it writes the brief of what
it would do and does none of it until you change `tick_mode` in `state/ceiling.json`. Timer and cron
examples are in `template/agents/systemd/`; `WALKTHROUGH.md` § Later has the steps.

Sessions **rotate** instead of growing: at the context-size notice, `prompts/rotation.md` writes a
carry file that the next session's start hook prints.

## Security - read this before installing

- **The plugin's hooks and skills run as you, with your permissions.** Read every file in `plugin/`
  before you install it. That is a fair thing to ask of anything you install.
- Hooks need `bash` and `jq`. If `jq` is missing, all the gates are off (session start prints a
  warning).
- **The setup session (`SETUP.md`) never turns the plugin on.** It lists it in your settings as off,
  walks you through the hooks, and leaves the switch to you.
- **Windows: install Git for Windows. This kit needs it, even though Claude Code does not.** (The
  setup session offers to install it and `jq` with `winget`, each behind a prompt you approve.)
  Claude Code's docs (code.claude.com/docs/en/setup, /hooks, checked at release) say Git for
  Windows is optional. Without it, the Bash tool and hook commands run under PowerShell. This
  plugin's hooks are bash scripts, so without Git Bash they do not run, and **every gate is
  silently off**. With Git for Windows installed, hooks run under Git Bash. After installing, run
  `check-gates.sh --live "git push"` with `AGENT_ROLE=overseer` and confirm it prints BLOCKED (setup step 7 does this). Install `jq` too
  (`winget install --id jqlang.jq -e`, or `scoop install jq`). If Git Bash gives you trouble, WSL (Windows Subsystem for
  Linux) is the alternative. The hooks have only been tested on Linux, so treat Windows as
  unverified. On Windows the session registry (H5) shows nothing — it reads `/proc`. If
  `check-gates.sh` fails there, the first-hour layer still works: the plugin's skills and personas
  need no hooks.
- **Linux:** the platform the hooks were tested on.
- **macOS:** untested.
- The gates are pattern matches over the text of a command. They catch mistakes, not a model that is
  actively working around them. Treat them as guard rails, not a vault door.
- Gate H4 (the one that blocks irreversible commands) only binds when the environment variable
  `AGENT_ROLE` is set. In your own sessions H4 asks instead of blocking; never-paths block everywhere.
  That is deliberate: you are the human in the loop.
- Never run anything headless (no person watching) as root, or on a machine where your credentials
  are unlocked.
- Cloud sessions (claude.ai/code in the browser) do not load local plugins. It works in the
  terminal, in the desktop app's local sessions, and in VS Code.
- Nothing runs unattended until you schedule the tick.
- **Day-one thing not to do: run anything irreversible unattended.**
- Passwords and tokens: fetch them inside the command, into a variable, never print them and never
  redirect them into a file. If you use a password-manager command line, you can configure the
  optional H2 gate. H2 catches exactly two things: a bare listing command without `jq` (which would
  print every value), and redirecting or piping a fetched value into `cat`, `tee` or `echo`.
  Printing a value to the terminal, or echoing it through a variable, is **not** blocked. H4 is a
  list of common command shapes, not an exhaustive one; it misses, for example, other verbs or flags
  for the same action, compound commands whose first part is a pod delete, and `find -delete` outside the never-paths.
- H1 only sees shell commands and tool calls whose names start with `mcp__` or are
  `WebFetch`, matched by text; it is case-insensitive; it cannot know what a connector does. Keep
  your connectors' send tools on "ask" permission.
- The hooks' config files (`agents/estate.env`, `agents/guard.conf`) are parsed as plain `KEY=VALUE`
  text and never executed.
- Keep permission prompts ON for Bash.
- If a plugin hook script loses its executable bit, the gates are silently off. Check the executable bits yourself.
- The hooks find your rules through `AGENTS_REPO` (the setup puts it in Claude Code's settings
  `env`), or, if that is unset, the folder the session was opened in. Once `estate.env` exists and
  `AGENTS_REPO` is set, the gates apply in every Claude Code session on this machine, not only in
  your repo; any folder with an `agents/estate.env` turns them on for sessions opened there. See `WALKTHROUGH.md`'s "Turning it off" for how to undo that.
