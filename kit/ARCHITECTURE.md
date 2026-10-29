# Architecture

What the parts of the kit are, how a request moves through them at runtime, where state lives, and
why it is built this way, readable in about fifteen minutes without installing anything. Every
statement here points at a file in this folder; where this page and a file disagree, the file is what
runs (`template/agents/ROUTING.md` says the same about itself).

Paths are relative to this `kit/` folder. Paths that start with `agents/` or `roadmap/` are inside
your own repo, which is a copy of `template/` that setup makes for you.

## 1. Purpose and the three problems it answers

Point one agent at a long list of operational chores (a home network, a few servers, a media
library, backups) and three things go wrong, reliably. I built the kit as a response to those three,
one failure at a time, rather than designing it whole. The README's "The problem" is the short
version; here is what each one turned into.

**It does everything itself.** Planning, executing, reviewing and reporting happen in one context,
so the thing that checks the work is the thing that did the work. The answer is a separation of
roles that is structural, not a matter of instruction. The session you talk to (the **overlord**)
routes and verifies and does not do the work. Reviewers are subagents whose `tools:` line has no
write tools, so a reviewer cannot quietly fix what it flags and then review its own fix. Workers do
the changing, and a different, cheaper subagent re-runs their checks.

**Its reports are unverified.** "Done" is a sentence, and a confident summary reads the same whether
the change worked or not. The answer is the **attestation table**: every report ends with claims,
one rerunnable read-only command per claim, and the expected output. The overlord re-runs those
commands (itself or through the `verifier` persona) before it believes a claim, updates state or
tells you anything. A claim with no check is surfaced as "reported, unverified", and what reaches
you is the originating agent's finding quoted verbatim, not a paraphrase.

**Cost and authority are unbounded.** The most expensive model gets used for everything, and nothing
distinguishes "restart a service" from "delete a volume" except the agent's judgment in the moment.
The answer has two halves. Cost: each role has a model row (reading is cheap, doing is mid-range,
judging is expensive, designing is top), and before it does anything the unattended loop checks a
daily ceiling kept in a file the agent cannot edit. Authority: every action is sorted onto two short
lists (**never**, and the **owner's hand**) with everything else fair game, and the lists are
enforced by hooks, which are scripts that pattern-match a command before it runs. A model can argue
with a prompt; it cannot argue with a regex.

## 2. Components

The kit has three parts and a connector. The **plugin** is code that runs inside Claude Code. The
**template** is the repo you own: rules, state and tools as plain files. The optional **mod** draws
the state above the prompt. The **settings drop-in** connects them by adding a few entries to your
Claude Code user settings.

```
  hatchery/kit/  (the unpacked kit; a newer kit is unpacked over it)       your repo  (a copy of kit/template/)
 +-----------------------------------------------+                  +------------------------------------------+
 | plugin/          the Claude Code plugin       |                  | CLAUDE.md          the rules             |
 |   skills/        overlord, overmind           |  hooks find the  | roadmap/           decision log, goals,  |
 |   agents/        9 subagent personas          |  repo through    |                    home-setup, specs     |
 |   hooks/         guard-bash, guard-tools,     |  AGENTS_REPO --->| agents/ROUTING.md  the page that runs    |
 |                  session-start, session-end,  |                  | agents/guard.conf  H1 / H4 targets       |
 |                  context-watch; check-gates   |                  | agents/estate.env  turns the gates on    |
 | dropin/          settings merge + deny rules  |                  | agents/bin/        tick, strategist,     |
 | mods/overlord-board  optional band and pane   |<--- board.json --|                    act, drift, board ... |
 +-----------------------------------------------+                  | agents/prompts/    tick, strategist,     |
          ^                                                         |                    rotation, debrief     |
          |  ~/.claude/settings.json (written by dropin/):          | agents/senses.d/   checks the tick runs  |
          |    extraKnownMarketplaces.hatchery   (where the plugin  | agents/state/      memory, logs, ledgers |
          |    enabledPlugins hatchery = false    lives; listed off)| agents/systemd/    timer + cron examples |
          |    env.AGENTS_REPO                   (where your repo   +------------------------------------------+
          |    permissions.deny                   is; what agents
          |                                       may never edit)
```

### The plugin (`plugin/`)

A Claude Code plugin named `hatchery` (`plugin/.claude-plugin/plugin.json`, version 0.2.0). The
`kit/` folder is its marketplace root (`.claude-plugin/marketplace.json`), so Claude Code loads it in
place from the unpacked folder.

**Two skills.** `skills/overlord/SKILL.md` is the overlord's operating procedure
(`/hatchery:overlord`): wake, route, brief, verify, record, close out. `skills/overmind/SKILL.md` is
the framework review (`/hatchery:overmind`). They are skills, not subagents: they run in the session
you are sitting in, with that session's model.

**Nine personas** in `plugin/agents/`, each a Markdown file whose front matter fixes its tools and
model:

| Persona | Tools (`tools:` line) | `model:` | Returns |
|---|---|---|---|
| `worker` | Read, Grep, Glob, Bash, Edit, Write, WebFetch | sonnet | a Result, an Attestations table, what was not done, an `Unspecified:` line |
| `scout` | Read, Grep, Glob, Bash (inspecting commands only) | haiku | facts with exact locations; an `Unspecified:` line |
| `verifier` | Read, Grep, Glob, Bash (read-only commands only) | haiku | PASS / FAIL per claim, with the actual output |
| `researcher` | Read, Grep, Glob, WebSearch, WebFetch | sonnet | a fact table: claim, status, URL, verbatim quote |
| `on-call` | Read, Grep, Glob, Bash (diagnostics only) | sonnet | symptom, timeline, diagnosis with confidence, recommended action and its list, what was ruled out |
| `security` | Read, Grep, Glob | opus | APPROVE, APPROVE WITH CHANGES or BLOCK, with findings |
| `stakeholder-impact` | Read, Grep, Glob | sonnet | who is affected and when; APPROVE, APPROVE WITH CONDITIONS or BLOCK |
| `optimization` | Read, Grep, Glob | sonnet | concrete `file:line` edits; READY or NEEDS EDITS |
| `design-review` | Read, Grep, Glob | opus | APPROVE, APPROVE WITH CHANGES, RETURN TO DESIGN or NEEDS THE OWNER |

The model names are placeholders for tiers; the tier table is `ROUTING.md` §1, and you edit a
`model:` line if a name is not on your plan. The personas that hold Bash (scout, verifier, on-call)
are read-only by instruction, and the hooks still apply to them like to anyone else.

**The hooks** are wired in `plugin/hooks/hooks.json`:

| Claude Code event | Script | Gates |
|---|---|---|
| `PreToolUse`, matcher `Bash` | `guard-bash.sh` | H1, H2, H4 (with the never-delete paths), the shell side of H7 |
| `PreToolUse`, matcher `mcp__.*\|WebFetch` | `guard-tools.sh` | H1 for connector and web-fetch calls |
| `SessionStart` | `session-start.sh` | H5: register the session, print the other live sessions and context |
| `UserPromptSubmit` | `context-watch.sh` | H6: a context-size notice, never a block |
| `SessionEnd` | `session-end.sh` | H5: remove the registration |

`check-gates.sh` is not wired to an event: it is the regression runner for `cases.txt`, and
`check-gates.sh --live "<command>"` runs one command text through `guard-bash.sh` with your real
configuration without executing it. H3 (a pre-commit secret scan) is designed but not shipped. H7's
other half is not a script at all: it is the permission deny rules the drop-in adds.

Every hook is inert unless `AGENTS_REPO` (or, when that is unset, the folder the session was opened
in) contains `agents/estate.env`. Configuration files are parsed line by line as `KEY=VALUE` text and
never sourced or executed. Without `jq` the gates are off, and the session-start hook says so.

### The template repo (`template/`)

Setup copies this folder to a repo of your own (suggested name `home-ops`), outside the kit folder so
a newer kit never overwrites it.

- **`CLAUDE.md`, the rules.** Six rules every session reads (a locked decision log, update the spec
  you touched, no secrets, no sends to anyone but you, an availability tier for every new service,
  Claude-managed git), and a pointer to `roadmap/home-setup.md` for local facts.
- **`roadmap/`, the plan.** `ROADMAP.md` holds a status table, the **decision log** only you amend,
  and how a spec works (a `Status:` line, steps, a dated Log, the attestations the phase must prove).
  `goals.md` holds targets with a signal a command can answer; the tick ranks work against them.
  `home-setup.md` says what you have and what agents may do with each thing (`read`, `manage`, `ask`,
  `never`), who depends on it, quiet hours, what is irreplaceable and what is always on.
- **`agents/ROUTING.md`, the routing table.** The one page every role reads, from roles and models
  (§1) to the session lifecycle (§9); sections 3 to 8 of this page follow it.
- **`agents/estate.env` and `agents/guard.conf`**, copied from their `.example` files at setup.
  `estate.env` turns the gates on and may name a secret-manager CLI for H2. `guard.conf` names who
  must never be messaged (`H1_PATTERNS`), the data roots that may never be deleted (`H4_NEVER_PATHS`),
  the provider API hosts whose writes ask (`H4_PROVIDER_HOSTS`), and your own owner's-hand shapes
  (`H4_ASK_PATTERNS`).
- **`agents/prompts/`, procedures read as files:** `tick.md` (the headless loop), `strategist.md`
  (the slow context), `rotation.md` (carry and successor) and `debrief.md` (five close-out questions).
- **`agents/senses.d/`**: executable checks the tick runs before the model starts (two examples).
  **`agents/systemd/`**: timer, service and cron examples for the tick. **`agents/state/`**: section 5.

The tools in `agents/bin/` are small scripts, bash or Python standard library only, with their own
tests (`test_board.py`, `test_usage.py`):

| Tool | What it does |
|---|---|
| `tick` | The governor loop's wrapper: `tick` (daily), `tick weekly`, `tick senses` (section 6) |
| `strategist` | The mechanical half of the strategist: `arc`, `lint`, `alarms`; it writes only `state/arc.md` |
| `act` | One activity row per action: what, the undo, the proof |
| `drift` | One drift line: timestamp, kind, initiative, message |
| `note-to-overmind` | One line on the channel the overmind reads at review |
| `rehydrate` | The overlord's wake view of `overlord.md`, at most 6 KB, with alarms |
| `archive-state` | Moves settled rows out of `overlord.md` byte for byte; dry run unless `--apply` |
| `board` | Renders the state files to a local read-only page and `board.json`; no server, no network |
| `usage` | A token ledger of sessions and subagents, priced at API list price as a measure of work |
| `rotate`, `carry` | The file side of session rotation, and the audit that every rotation wrote its carry |

### The settings drop-in (`dropin/`)

`merge-settings.sh` adds four things to `~/.claude/settings.json` from `hatchery-settings.json`: the
marketplace entry, the plugin listed as **disabled**, `env.AGENTS_REPO`, and `permissions.deny` rules
that stop the editor tools from changing the files that govern the agent (your user settings, the
plugin's hooks, and in your repo `ceiling.json`, `guard.conf`, `estate.env`, `agents/bin/`,
`agents/senses.d/`, `agents/prompts/`, `costs.tsv` and `.claude/`). It is a dry run unless you pass
`--apply`, keeps a dated backup, never prints your other values, keeps yours where you already have
one, and refuses a file it cannot parse. Turning the plugin on is always your own action.

### The optional mod (`mods/overlord-board/`)

A Claude Code mod (version 0.3.0, one file of logic, `hooks/register.tsx`) that draws a band above
the prompt and adds a `/board` pane from `$AGENTS_REPO/agents/state/board/board.json`. It is a base
template: the band is four blocks (priorities, roles, alarms, the overmind review line) and a foot
row, in an order and with row counts set by an optional `$AGENTS_REPO/agents/board-mod.json` that
setup writes from a few questions. A short band has no headings and one alarm count line; a tall one
has headings, every alarm and the extra lines. The config is read the same way as the board (through
the engine, size-capped, parsed defensively) and any problem with it falls back to the defaults key by
key. The mod spends no model tokens, uses no network, reads nothing from the working directory, and the
only thing it ever runs is `agents/bin/board`, on `/board refresh`. It ships off; you load it with
`--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`. Its 51 tests run with `claude plugin test mods/overlord-board`.

### Repository map

| Path | What it is |
|---|---|
| `../README.md`, `../LICENSE` | Why it is built this way, and the licence (the published repository) |
| `../START-HERE.md` | The only install document: what you agree to, a no-install try, then "set me up" |
| `../CLAUDE.md` | Routes "set me up" in a session opened on the kit folder to `SETUP.md` |
| `SETUP.md`, `WALKTHROUGH.md` | The guided first session; the first hour after it, later steps, turning it off |
| `ARCHITECTURE.md` | This page |
| `INTEGRATIONS.md`, `EXAMPLE-INCIDENT.md` | What it can be pointed at; a reconstructed outage, start to finish |
| `README.md` | Reference: every term once, the gates, what is in the box, technical security notes |
| `SECURITY.md`, `CHANGELOG.md` | The trust model and how to report a problem; what changed per version |
| `.claude-plugin/marketplace.json` | Makes `kit/` a plugin marketplace |
| `plugin/` | The plugin: `skills/`, `agents/`, `hooks/` |
| `dropin/` | `hatchery-settings.json`, `merge-settings.sh` |
| `mods/overlord-board/` | The optional mod |
| `template/` | The repo you copy: `CLAUDE.md`, `roadmap/`, `agents/`, `.gitignore`, `.gitattributes` |

## 3. Roles and the delegation model

You start two things by name: `/hatchery:overlord` for work and `/hatchery:overmind` for a review of
the framework. Everything else is briefed by the overlord, and nothing below it talks to you
directly: every finding reaches you through the overlord, quoted.

- **Overlord.** The session you talk to. It reads `agents/state/overlord.md` (its memory between
  sessions), `ROUTING.md`, `CLAUDE.md` and `home-setup.md`, checks which other sessions are live,
  verifies any new reports, and then routes by list: reading and inventory to a `scout`; anything
  shaped like "is X working?" or "X is down" to `on-call` first, before anyone restarts anything; a
  bounded change to one `worker`; external facts to the `researcher`; anything larger to an
  **initiative**. It may run read-only status checks, verification commands and `agents/bin/*`; it
  does not do a worker's job because that is faster, and if it does, it writes a `routing-bypass`
  drift line.
- **Overseer.** The role that owns one initiative from brief to report. In the kit the overlord plays
  it in the same session: it gives the initiative an id, adds a row to *Open initiatives*, writes a
  brief to `agents/state/briefs/<id>.md` whose attestations are stated up front, runs workers, a
  verifier and any required review, and writes the report to `agents/state/reports/<id>.md`. In my
  own deployment overseers are separate headless runs on their own branches (section 11).
- **Specialists.** Read-only reviewers that return a verdict or a diagnosis and nothing else:
  `on-call`, `security`, `stakeholder-impact`, `optimization`, `design-review`. A reviewer that could
  also fix the problem would fix it, and then the review would be of its own work.
- **Workers, scouts, researchers, verifiers.** The hands and eyes. A worker does exactly its brief on
  the branch it was given, under three habits (section 4), and ends with attestations. A scout reads
  and reports locations. A researcher returns a fact table from primary sources. A verifier re-runs
  attestation commands and refuses any that could write or chain.
- **Overmind.** A review of the framework itself, run with you and never on its own. It reads the
  notes, the drift log, the debriefs and a sample of reports since its last review marker, answers
  three questions (was routing right, were gates respected, is the spirit intact) and proposes
  changes to personas, routing, gates and budgets. It owns framework work end to end and delegates
  the doing; questions about the framework that change nothing may be answered there, and any other
  work goes to the overlord.

**Who may write what** (from `ROUTING.md` §1, the skills and the persona `tools:` lines):

| Role | Runs as | Model row | May write |
|---|---|---|---|
| overmind | interactive, with you | top | `agents/**`, once you agree to the change; the review marker; its debrief |
| overlord | interactive (`/hatchery:overlord`); headless as the tick | expensive | `agents/state/` (its memory, briefs, reports, notes, drift), spec Status lines and Logs, merges to `main` |
| overseer | the overlord, in the kit | mid | the spec it executes, its report |
| worker | subagent | mid | the working tree, within its brief; an owner's-hand action only on a `GO` block |
| scout, verifier, researcher | subagent | cheap, cheap, mid | nothing |
| specialists | subagent | mid to top | nothing; a verdict |
| strategist | a procedure read as a file, by the tick or the overlord | the caller's | `arc.md`, `priorities.md`, `next.md`, `threads.md`, `brief/` |
| you | | | `goals.md`, the decision log, `ceiling.json`, `guard.conf`, `estate.env`, `agents/bin/`, `agents/prompts/`, `agents/senses.d/`, the timer or crontab |

The last row is enforced, not requested: the deny rules and H7 keep agents from editing the files
that decide what an agent may do.

**Owner's-hand actions travel as a `GO` block.** The overlord stages the exact command as a numbered
row in *Ask the owner*. When you say go for that row in an attended session, the worker's brief
carries `GO ask #N: "<your words verbatim>"` followed by `RUN:` and the staged commands. The worker
cross-checks every `RUN:` line against the staged row, runs exactly those commands in order, and stops
on any failure or mismatch. A go never carries over to another brief, and an unattended brief that
contains one is refused.

**Two failure rules keep the loop from spinning.** A brief that fails twice (no report, or failed
attestations) goes to the Ask table instead of a third try with a bigger budget. Two BLOCKs of the
same class from a required review stop the work with one question for you: is the bar wrong, or the
approach?

## 4. The gate model

Everything the framework might do is sorted before it happens (`ROUTING.md` §2):

| List | Examples (edit them to fit your setup) | Who may, when |
|---|---|---|
| **Never** | sends to anyone; a secret value in output, a file or a transcript; anything unattended that depends on a machine that is not always on; editing the decision log; money; deleting your own data | nobody, in any mode; you do these yourself |
| **Owner's hand** | the internet path (firewall, DNS zones, tunnels, TLS, the identity provider); core config of anything people rely on; storage layout; host power; deletes on a media or backup mount; any mutation by selector or `--all`; git history; anything `home-setup.md` marks `ask` | staged with the exact command; attended: your explicit go; unattended: staged and stopped |
| **Fair game** | everything else: restarts, rollouts, scaling, applies of a reviewed manifest, named pod and job deletes outside the system namespaces (if you run Kubernetes), service API writes, repo edits on a branch, staged moves | anyone, attended or unattended, under three habits |

The three habits are the gate for fair game. **Look before you touch**: read the target's live state
first and stop on any mismatch with the brief (another owner, another age, a selector reaching past
the named thing). **Record the undo**: the exact command or file that restores the previous state.
**Log it**: `agents/bin/act` with what, undo and proof. `home-setup.md` can only make a thing
stricter: `ask` is owner's hand, `never` is never, `read` is look only.

**The hooks are the mechanism.** What each gate does depends on whether a person is present
(`AGENT_ROLE` unset) or the run is unattended (`AGENT_ROLE` set, as the tick sets it):

| Gate | What it matches | Attended session | Unattended run |
|---|---|---|---|
| H1 | a command or tool call naming a never-send target (`H1_PATTERNS`) | block | block |
| H2 | a bare secret listing without `jq`; a fetched value piped or redirected; a fetch inside an unquoted heredoc (only if `SECRET_CLI` is set) | block | block |
| H4, never paths | `rm -r`, `find -delete`, `rsync --delete`, `unlink`, `shred` naming a path in `H4_NEVER_PATHS` | block | block |
| H4, owner's-hand shapes | non-pod `kubectl delete`, `helm uninstall`, recursive `rm` on a live path, host power, storage-layout tools, force push, history rewrite, deleting or resetting `main`, a write call to a provider host, your own `H4_ASK_PATTERNS` | **ask** (a block under `bypassPermissions`, where an ask would be auto-approved) | block |
| H4, branch discipline | `git push`, touching `main`, hand-written refs | allowed | block |
| H5 | (session registry) | notice | notice |
| H6 | context size | notice | off |
| H7 | writes to the control files: editor tools by deny rule, shell writes by pattern | block | block |

A block exits 2 with `BLOCKED by gate Hn: <reason>`, which reaches the model, and appends a
`hook-block:Hn` drift line. An ask returns a permission prompt to you; approving is the go for exactly
that command and is logged as `hook-ask:H4`. The hooks fail open on their own errors (in
`guard-bash.sh`, any error of the script's own exits 0, which allows the call), which is one reason
they are guard rails and not a sandbox.

**Reviews: one merge gate.** `security` is the only review that blocks a merge. Its triggers are
ingress, a reverse proxy, tunnels, the identity provider, TLS, network policy, the firewall, a new
internet-reachable surface, and anything that reads or moves a token. `on-call` is also required,
but as the first step of any incident, not at merge. Stakeholder impact and optimization are habits
the overseer applies itself, with the persona as a second read when it wants one. The overseer's
report names which reviews it ran and why not the others.

**Class F: design review.** A decision-log amendment (drafted, never applied by an agent), a new
service or automation (where its availability tier is assigned), a new spec, or a change to a
persona, a model row, a gate, a budget or a rule in a prompt stops for `design-review` (or for you).
Skipping one needs a `waived-F` drift line naming who waived it and why. I narrowed class F to this
after the log showed the broader gate being waived over and over.

### How a permission decision flows at runtime

```
  you         Claude Code          plugin hooks            overlord skill        worker subagent      verifier
   |               |                     |                       |                     |                 |
 1 |--open repo--->|--SessionStart------>| session-start.sh      |                     |                 |
   |               |<--context, peers----|  (H5: register)       |                     |                 |
 2 |--request----->|--UserPromptSubmit-->| context-watch.sh      |                     |                 |
   |               |<--H6 notice?--------|  (H6, never blocks)   |                     |                 |
 3 |               |--/hatchery:overlord------------------------>| wake: read state,   |                 |
   |               |                     |                       | ROUTING, rules,     |                 |
   |               |                     |                       | home-setup; route   |                 |
 4 |               |                     |                       |--brief + attest.--->|                 |
 5 |               |<-- Bash(command) -------------------------------------------------|                 |
   |               |--PreToolUse-------->| guard-bash.sh:        |                     |                 |
 6 |               |<--block (exit 2)----|--reason to the model; drift---------------->| stops, reports  |
   |<--prompt------|<--ask---------------| your answer is the go for this command      |                 |
   |--yes / no---->|                     | allow: Claude Code's own permission rules   |                 |
 7 |               |--runs it, only if allowed or approved---------------------------->|                 |
 8 |               |                     |                       |<--report + table----|                 |
 9 |               |                     |                       |--Verify-with rows-------------------->|
   |               |                     |                       |<--PASS / FAIL, actual output----------|
10 |<--findings quoted, unverified marked, asks queued-----------|                     |                 |
```

1. **Session start.** `session-start.sh` finds the Claude Code process above it (by the session id in
   Claude Code's own per-process file), writes one registration file, and prints the role, the other
   live sessions, the head of `overlord.md`, a recent carry and the drift count.
2. **Prompt submit.** `context-watch.sh` reads the transcript's last usage figures and, past the
   thresholds in section 8, tells you and the model that a fresh session would be cheaper.
3. **The overlord wakes** from files, not from memory, and 4. **routes by list**, writing a brief with
   the attestations the report must prove.
5. **A subagent calls Bash.** Claude Code runs the `PreToolUse` hook first, with the command text,
   the permission mode and the agent type as JSON on stdin.
6. **The hook decides.** H1, H2, H7 and the never paths read the full text. The attended owner's-hand
   decision reads the text with heredoc data stripped by an allowlist, so a document that mentions a
   power word is not a power command. A block ends the attempt and the worker reports it verbatim:
   a refusal is a stop. An ask becomes a permission prompt. An allow hands the call back to Claude
   Code's normal permission rules and, in auto mode, its classifier, whose denials are treated
   exactly like a hook block.
7. **The command runs** only if allowed or approved, and 8. **the worker reports** in a fixed shape
   that ends with the Attestations table.
9. **The verifier re-runs** each `Verify with` command and passes a row only on a match.
10. **The overlord reports to you**: what needs a decision first, the findings quoted, what it
    verified and what is "reported, unverified", and any owner's-hand item staged in the Ask table.

## 5. State model

Nothing lives in a running process. Every fact the framework uses between turns is a file in your
repo: Markdown tables, tab-delimited logs or JSON. Tables are read by column name, so extra columns
do not break the tools. Most files have exactly one writer.

**Committed** (the tick stages `agents/state` and `roadmap` after each run, never `ceiling.json`):

| File | What it holds | Written by |
|---|---|---|
| `agents/state/overlord.md` | Open initiatives, *Ask the owner* (staged actions and the recorded go), Recently closed, Watching, Last wake | the overlord (attended or as the tick); you answer Ask rows |
| `agents/state/briefs/<id>.md` | what an initiative is asked to do, with its attestations | the overlord |
| `agents/state/reports/<id>.md` | the report: outcome, changes, reviews, attestations, needs-human, friction | the overlord, from the subagent chain |
| `agents/state/drift.log` | `timestamp \| kind \| initiative \| message`, append-only | `agents/bin/drift`, called by roles and by the hooks |
| `agents/state/activity.tsv` | one row per action: time, who, initiative, what, undo, proof | `agents/bin/act` |
| `agents/state/notes-to-overmind.md` | append-only channel to the review, with review markers | `agents/bin/note-to-overmind`; the overmind appends the marker |
| `agents/state/debriefs/<date>-<role>-<id>.md` | five close-out answers per attended session | the overlord and the overmind |
| `agents/state/ceiling.json` | daily budget, `tick_mode`, tick model and caps, WIP limits, notify cap, size caps | you only (deny rule and H7) |
| `agents/state/strategist.json` | timezone, weekly hour, first weekly check-in | you |
| `agents/state/costs.tsv` | one row per unattended run: model, turns, cost, outcome, origin | `agents/bin/tick` only (deny rule and H7) |
| `agents/state/arc.md`, `priorities.md`, `next.md`, `threads.md` | the slow context: per-spec arc, ranked priorities, now and on deck, threads waiting on the world | the strategist procedure (`arc --write` for the generated parts) |
| `agents/state/brief/` | the morning brief and the weekly hour | the strategist procedure |
| `agents/state/carry/<role>.md`, `carry/closed.tsv` | the rotation carry and the close rows | the rotating session; `agents/bin/rotate record` |
| `agents/state/archive/` | rows moved out of `overlord.md`, byte for byte | `agents/bin/archive-state --apply` |
| `roadmap/specs/*.md` | each spec's Status line and dated Log | whoever executes the spec (rule 2 in `CLAUDE.md`) |
| `roadmap/goals.md`, the decision log in `roadmap/ROADMAP.md` | targets; locked decisions | you only |
| `agents/guard.conf` | gate targets | you only (the tick refuses to run if it differs from the last commit) |
| `agents/board-mod.json` | optional layout for the overlord-board mod (title, order, rows, foot); no secret in it | you (setup writes it from your answers) |

**Runtime, git-ignored** (`template/.gitignore`):

| Path | What it holds | Written by |
|---|---|---|
| `agents/estate.env` | turns the gates on; optional `SECRET_CLI` | you |
| `agents/state/sessions/` | `<id>.json` registrations, `<id>.ctx` context tiers, `star-<role>` | the session hooks, `context-watch.sh`, `agents/bin/rotate` |
| `agents/state/runs/` | each tick's log and JSON result | `agents/bin/tick` |
| `agents/state/senses.tsv` | the latest sense findings | `agents/bin/tick` |
| `agents/state/usage.tsv` | the token ledger | `agents/bin/usage scan` |
| `agents/state/board/` | `index.html`, `board.json` | `agents/bin/board` |

A session that dies loses nothing, because its successor reads the same files, and every decision
can be read, diffed and reverted with git. Files stay small: `agents/bin/rehydrate` prints a 6 KB
wake view with an `OVER CAP` alarm past a file's `size_caps` entry, and `agents/bin/archive-state`
moves settled rows out losslessly (bytes removed equal bytes appended, checked before writing).

## 6. The governor loop

The framework has one loop, and it is cold: a daily **tick** plus any event wakes you configure, and
nothing in between. The tick is the overlord procedure run headless with `AGENT_ROLE=overlord`, so
every hook binds it and every owner's-hand shape blocks instead of asking. It ships switched off: you
need an always-on machine and a timer you write yourself (`agents/systemd/`).

**The wrapper** (`agents/bin/tick`) runs in this order; steps 1 to 5 exit before any model call:

1. **Argument guard.** Only `daily` (the default), `weekly`, `senses` or `-h`; a typo exits 2.
2. **Circuit breaker.** Today's unattended rows in `costs.tsv` against `daily_usd` and `daily_turns`
   in `ceiling.json`. It fails closed: a missing, corrupt or non-positive ceiling, or any error in
   the check, counts as spent. Attended sessions are not limited.
3. **Pull** if a remote exists. 4. **Single writer:** any live overlord session, or any live session
   working inside the repo, wins and the tick exits. 5. **Control files at HEAD:** if `ceiling.json`,
   `agents/bin`, `agents/prompts` or `guard.conf` differ from the last commit, it refuses to run.
6. **Senses.** Only scripts tracked by git and unchanged since HEAD run (30 seconds each); an
   untracked or edited one is skipped and reported as a finding.
7. **The headless run.** `claude -p` with `prompts/tick.md` appended to the system prompt, the model
   and caps from `ceiling.json`, and extra arguments only from the unit's environment, filtered
   against flags that would drop the hooks or skip permissions.
8. **Ledger and commit.** One row in `costs.tsv`, a commit of what the run wrote (never
   `ceiling.json`), and a push only if `tick_push` is true. The model never commits or pushes itself.

**The procedure** (`prompts/tick.md`) is the loop the model follows: read the wake view, goals, home
setup, recent activity and drift; then **senses** (what broke), **close** (rows whose evidence says
done), **fix** (a finding with a runbook entry and a fair-game fix), **finish** (owed rows and
*Watching* lines, or reshape your part to one tap and stage it), **open** (at most one new
initiative, ranked by `goals.md`), and **brief** (the strategist writes the morning brief).

**Propose, then act.** `tick_mode` starts as `propose`: the tick reads, verifies and writes into the
brief what it *would* close, fix, finish and open, with the exact commands, and does none of it. You
flip it to `act` in `ceiling.json` after a week of briefs you agree with. I built it this way because
the first autonomous step should be one whose output a person reads before anything changes.

**Limits that are numbers in a file.** `wip_initiatives` and `ask_backpressure` cap open work: at the
limit the tick opens nothing and only closes, fixes and finishes. Review bandwidth, not agent
throughput, is the bottleneck. `notify_max_per_day` caps pushes, and the notify command itself is
read only from `HATCHERY_NOTIFY_CMD` in the unit or cron line, never from a file an agent can edit.

**Senses** are how the loop notices anything at all. A sense prints zero or more tab-delimited
rows (`severity`, `what`, `evidence`, `fix-list`, `runbook`) and nothing when all is well; `fix-list`
is `fair`, `hand` or `never`, following the thing's access word in `home-setup.md`. A sense is code
the tick runs unattended, so only scripts you committed run.

**The strategist** is a procedure, not a persona. In `daily` mode (the tick's last step) it re-ranks
`priorities.md` (goal, then rows unblocked, then age, then the slot you actually have: a tap, a
reply, time at the computer, an evening, a decision), rewrites `next.md` and `threads.md`, and writes
a morning brief of at most 40 lines that says what *moved* since the last one. In `weekly` mode it
writes the weekly hour: closures to confirm, a re-rank and the week's one big thing. `attended` and
`apply` modes serve the overlord when you ask where your hour should go, and when you answer the
weekly. `agents/bin/strategist` does the parsing, lint and alarms (`DEAD`, `STALE`, `ORPHAN`, stale
priorities, a weekly check-in due) at zero model tokens.

**Noop is success.** A tick that finds nothing to close, fix, finish or open writes a short brief and
exits. Candidates come only from `goals.md`, a sense finding or an owed row: the tick never invents
work and never chooses a goal.

## 7. Verification and evaluation

**Attestations.** Every worker and overseer report ends with a table:

| Claim | Verify with | Expected |
|---|---|---|

Each `Verify with` cell is one backticked, rerunnable, read-only command; `Expected` is a literal or
`~text` (the output contains the text). The verifier refuses a command that chains (`;`, `&&`, `||`),
redirects, pipes into a shell or names a write verb, marks it FAIL, and passes a row only on a match.
A brief states its attestations up front, so "done" is defined before the work starts. In my
deployment at least one attestation must also exercise the thing rather than read it; I added that
after two data-safety bugs passed reviews that had only read the artifact. In the kit the nearest rule
is the optimization checklist's: a dry run must exercise the path where a tool succeeds without
producing a file.

**`Unspecified:` lines.** Worker, scout and verifier output ends with one line naming what the brief
left open and how it was resolved. Two reports naming the same gap get a rule written for it.

**The gate regression suite.** `plugin/hooks/cases.txt` holds 309 cases, each a header
`### <role> <expected> [tool|bypass|fp]` followed by the command text: 166 expect a block, 58 an ask
and 85 an allow, and 4 are pinned, accepted false positives. `check-gates.sh` replays them against a
temporary configuration and adds 29 built-in tests for configuration safety (config never executed,
malformed config inert, session ids validated), and ends `338 passed, 0 failed`. The rule that keeps it
honest: every hook false positive or false negative becomes a case in the same change as the hook
edit.

**Golden replays.** In my deployment, real misses are frozen as golden defects and replayed through
the persona that should have caught them, at its own model row; a persona change is judged by
whether it still catches them. That tooling (with a report score and a generated scorecard) is not in
the kit (`ROUTING.md` §8). The habit is: a real miss becomes a test case **before** the persona or
hook is edited, and an edit that does not change what gets caught is prose, not a fix.

**The drift log.** One line per deviation, with a kind: `routing-bypass`, `waived-F`,
`attestation-fail`, `hook-block:<gate>`, `hook-ask:<gate>`, `gate-skipped`, `classifier-deny`,
`rotation-failed`, `other`. The hooks write their own lines. Because the log is data, a review can
count it: a kind that rises is a finding, and a gate that is only ever waived is mis-scoped.

**Debriefs.** Every attended overlord and overmind session ends by answering five questions into
`agents/state/debriefs/`: what it spent its turns on, what got in its way, where it guessed, which
rule was unclear, and what its successor needs. Nobody grades them.

**The overmind review** brings these together. If there are no notes, drift lines, reports or
debriefs, it says "nothing to review yet" and stops. Otherwise it reads everything since the last
review marker, counts drift by kind, samples two or three reports (did the model match the work, were
the reviews real, did the attestations hold when re-run), and proposes edits ranked by evidence, with
a bias toward removing things. Two debriefs naming the same friction get an edit at that review.

**Seeing it.** `agents/bin/board` projects the state into a local page and `board.json` (open work,
asks, priorities, what ran unattended, spend, days since the last review, and an alarm for guard
denies on attended sessions in the last 15 minutes). `agents/bin/usage` prices sessions and
subagents at API list price, to compare roles and models, not as a bill.

## 8. Session lifecycle

**Start.** The session-start hook registers the session and prints the context block (section 4).
The overlord's wake steps follow: pull, read its state, the routing table, the rules and home setup;
look at the other live sessions and never start work that overlaps theirs; verify any new report
before reading anything else into state.

**Growth.** A long session re-reads its whole context every turn, and a turn after an idle hour
re-writes all of it. `context-watch.sh` gives a notice at the thresholds in `context-watch.conf`
(150,000 tokens, then every 100,000, or an idle return of 55 minutes with 60,000 or more), and the
notice is the cue to rotate.

**Rotation** (`prompts/rotation.md`) replaces one long session with a fresh one that starts from a
2 to 5 KB **carry**: a header line (role, date, why, session id) and five sections, in order: urgent
in flight, waiting on the owner, done this session, open but not urgent, and what is lost on clear.
`agents/bin/rotate check` validates the carry, the carry is committed, and `agents/bin/rotate record`
appends the close row and moves the role's live-session marker to the successor. The next session's
start hook prints the first 40 lines of a carry written in the last 24 hours; the successor reads it,
re-checks what was lost on clear, and never re-reads the predecessor's transcript.
`agents/bin/carry` lists any rotation in the last week whose carry was not written in time, as
evidence for the review, never as a gate.

**Close-out.** Before it stops, the overlord updates `overlord.md` (open initiatives, asks, recently
closed, last wake), appends anything the overmind should know to the notes and drift log, answers the
debrief, and commits. Pushing is your decision. The session-end hook removes the registration, and a
registration whose process is gone is pruned at the next session start.

## 9. Security notes

The trust model, what to report and how, and the known limits are in [`SECURITY.md`](SECURITY.md);
the technical notes behind it are in [`README.md` § Security](README.md#security). In short: the
gates are **pattern matches over command text** that catch mistakes and drift, not a sandbox, and the
owner's-hand list is common shapes, not every shape. Everything runs **as you**. The hooks **fail
open** on their own errors and are **off** without `jq`, without `agents/estate.env`, or on Windows
without Git Bash; setup proves they run. The deny rules cover the editor tools and the shell side of
H7 is a pattern match, so make the control files read-only to the agent's user for real protection.

## 10. Design principles

- **Hooks enforce; prompts advise.** Anything that must hold goes into a hook or a deny rule. A rule
  that lives only in a prompt is a request.
- **Separate who judges from who changes.** Reviewers have no write tools; the verifier is not the
  worker.
- **Verify, do not trust.** A claim is believed after its check passes a second time, and what
  reaches you is quoted, not summarised.
- **State lives in files.** A session can die, rotate or be replaced without losing anything, and
  git is the audit trail.
- **Noop is success.** "Nothing to do" is a correct output; an invented task is a failure.
- **The framework never picks its own targets.** It works on what you hand it and on the goals you
  wrote; it does not add a goal.
- **A refusal is a stop.** A refusal from a hook, the harness or its classifier, read-only commands
  included, is reported verbatim and logged; nobody reaches the same effect through a wrapper script
  or another tool.
- **A gate that is only ever waived is mis-scoped.** Early versions required several sign-offs on
  most changes; I removed them when the log showed them waived again and again.
- **Autonomy is staged.** Propose before act, attended before unattended, a person reading the first
  output before anything is scheduled.
- **A lesson becomes a test before it becomes a rule.**

## 11. What is deliberately not here

Some of what my own deployment runs is held back from the kit on purpose, until it has run live long
enough to ship:

- **Headless overseers.** In my deployment each initiative is dispatched as its own headless run on
  its own branch and worktree, with per-run turn and budget caps. `ROUTING.md` names the dispatcher
  (`agents/bin/dispatch`) and marks it v2; it is not shipped. In the kit the overlord plays the
  overseer in your session.
- **A role guard** that boxes a read-only overlord session into an exact allowlist of commands,
  argument by argument. The first live probes showed it too tight: the guarded session could not even
  reply to the person it was working for.
- **A strategist process as the single writer of status**, and persistent overlord and strategist
  sessions that stay open for a day instead of starting per task. Here the overlord plays those roles.
- **H3**, the pre-commit hook that refuses a secret-shaped string, warns on code changes without a doc
  change, and runs the gate suite when hooks change.
- **The evaluation tooling**: the report score, the golden-defect replays, the scorecard, and test
  suites for the state files, rotation, the strategist and the evaluator. What ships is the gate suite
  and the tools' own tests (`test_board.py`, `test_usage.py`, the mod's 51).
- **A heartbeat timer** for the overlord (`ROUTING.md` §1 marks it v2); the kit has the daily tick
  only.

And some limits are simply limits (the README's [Status and limitations](../README.md#status-and-limitations)
in the published repository has the full list):

- It is **Claude Code only**: it depends on the plugin, skill, subagent and hook mechanisms, and cloud
  sessions in the browser do not load local plugins.
- The hooks are **tested on Linux**; macOS is untested and Windows is unverified.
- The unattended parts **ship switched off** and need an always-on machine, a scheduler you set up and
  a `tick_mode` you flip yourself.
- It is **one person's kit**, shared as a worked example and a usable starting point, not a supported
  product; the numbers in the README describe one deployment.
