# Changelog

What changed in each version of the kit, newest first. Versions only: the plugin's and the mod's own
version numbers are given where they changed. Paths are relative to this `kit/` folder.

## 1.1.1

A documentation release, plus two small rule changes and a reworked mod. The plugin moves to 0.2.1 (a persona and two prompt files changed); the overlord-board mod moves to 0.3.0.

**Documentation**

- New `ARCHITECTURE.md`: the components, the roles and who may write what, the gate model with a
  runtime permission flow, the state files, the governor loop, verification, the session lifecycle,
  design principles, and what is deliberately not here.
- New `SECURITY.md`: the trust model, what to report and how, what is in scope, the known limits.
- New `CHANGELOG.md` (this file).
- The top-level README gains an Architecture section and a repository map in reading order;
  `START-HERE.md` points readers who want the design first at `ARCHITECTURE.md`; `README.md` lists
  the three new files.
- A wording pass over every document: one name per role (the overlord), the board page titled
  "overlord board", and the stakeholder-impact persona's opening line now says who its stakeholders
  are. Smaller fixes: `SETUP.md` step 5 now names the deny rules it adds (which `WALKTHROUGH.md`
  relies on); `README.md` says on-call is required first on any incident; one-line fixes in
  `WALKTHROUGH.md`, `INTEGRATIONS.md` and `EXAMPLE-INCIDENT.md`.
- `board.json`: the triage count for initiatives in progress is now keyed `in_flight`. Anything that
  reads the old key must be updated; the mod does not read it.

**Mod** (`mods/overlord-board`, 0.3.0)

- overlord-board 0.3.0: a configurable template. The band is built from four blocks (priorities, roles, alarms, the
  overmind review line) in an order you choose, laid out by an optional `agents/board-mod.json` (title, order, priority rows,
  one-line or full alarms, the foot fields, the stale limit, the extra lines, the board path). Every key is optional and an
  invalid one is ignored on its own; with no file it draws its defaults. Setup (`SETUP.md` step 8) asks five questions and
  writes the file; `template/agents/board-mod.json.example` and the mod README's Configuration table list every key.
- A short band now has no headings and one alarm count line (`▲ 3 alarms: …`); a tall one (12 rows or more) has the
  headings, every alarm row and the extra lines. The priorities show the next step, with the whole row in the hover card.
  The title line shows a spinner while the session is working and today's attended spend. The pane's first four sections
  follow your order.
- 51 tests, up from 27. No new engine calls: it still only reads files (the board and the config) and runs
  `agents/bin/board` on `/board refresh`.

**Rules**

- **The tick never commits or pushes.** `template/agents/prompts/tick.md`: the headless run writes its
  files and exits; the wrapper (`agents/bin/tick`) commits them and publishes them only when
  `tick_push` is on. Running `git push`, `git commit` or a commit-and-push helper from the tick is a
  blocked shape and a wasted turn, never a reason to find another route.
- **The overmind may answer questions about the framework.** `plugin/skills/overmind/SKILL.md`:
  questions that change nothing (describing the framework, a paragraph for a document, which rule
  applies) may be answered in the overmind session; only work that is not framework work goes to a
  fresh overlord session.

**Numbers** (the README's "Numbers, from my own deployment")

- The golden replay set in my deployment is now 23 cases; it was 29 at 1.1. I removed two reviewer
  personas there, optimization and stakeholder-impact, because both had become checklists the overseer
  applies itself in its report, and the six golden cases written for the optimization reviewer were
  retired with it.
  The kit keeps all nine personas.

## 1.1

Plugin 0.2.0, overlord-board mod 0.2.0.

**Hooks** (`plugin/hooks/guard-bash.sh`)

- **Heredoc data by allowlist.** A heredoc body is treated as text only when the whole command is one
  `cat` or `tee` opener line, its body and the exact delimiter line. Anything else is judged on the
  full text, failing closed. This closes four shapes that could hide a command behind heredoc data: a
  here-string (`<<<`), `$(…)` or a backtick inside an unquoted body, a function that redefines `cat`,
  and an opener line that ends in a backslash.
- **Line continuations.** Every full-text check reads both the raw text and the text with
  backslash-newline joined, so `rm -rf \` followed by a path on the next line is seen, and a comment
  ending in a backslash cannot hide the line after it.
- **Never-list deletes.** `rm -r` with the flags before or after the path, `xargs rm -r` fed from a
  command that names the path, `find … -delete` / `-exec rm` / `-ok rm`, `rsync --delete*` and
  `--remove-source-files`, `unlink` and `shred`, all against `H4_NEVER_PATHS`.
- **Host power.** Power verbs in command position through prefixes such as `sudo`, `env`, `nohup` and
  `timeout`, with redirects (`reboot>/dev/null`), `init` / `telinit` runlevels, `systemctl` power verbs
  and targets, `ssh host sudo reboot`, `bash -c`, and writes to `/proc/sysrq-trigger`.
- **The quoted-grep fix.** A `|` inside a quoted `grep` or `rg` pattern is alternation, not a pipe, so
  `journalctl | grep 'battery|shutdown'` no longer asks. Only literal patterns are blanked, which also
  closes the hole the release's security read found (an apostrophe inside a double-quoted string
  hiding a reboot).
- **H2.** A secret fetch inside an unquoted heredoc body is blocked: the value would land in the file.
- **Unattended git.** Hand-written refs and objects (`update-ref`, `commit-tree`) and moving a branch
  by hand (`branch -f/-M/-C`) are blocked; `git merge --ff-only origin/main` is allowed only as the
  whole command.
- **Session registry (H5).** `session-start.sh` finds the real Claude Code process by walking the
  parent chain and matching the session id, instead of a substring match on a command line that could
  record the wrong process; a registration superseded in the same process (`/clear`, a resume) is
  pruned.
- **Gate suite: 200 to 338 passing.** `cases.txt` has 309 cases plus 29 built-in tests in
  `check-gates.sh`. About 130 cases are new in this release, and some 70 of them fail against the
  1.0 guard.

**Personas and skills**

- **A refusal is a stop** (worker): a refusal from the harness, a hook or the classifier, read-only
  commands included, is reported verbatim, logged as `classifier-deny`, and never reached another way.
- **`Unspecified:` trailers** on worker, scout and verifier output: what the brief left open and how
  it was resolved. An attestation's `Expected` may be `~text` (the output contains the text).
- **Security persona:** hooks that are parsed rather than sandboxed are judged against honest mistakes
  and drift; a bypass only a deliberately adversarial agent would build is a note, not a BLOCK.
- **Overlord:** two BLOCKs of the same class from a required review stop the work with one question:
  is the bar wrong, or the approach?
- **Overmind:** owns framework work end to end and delegates the doing.
- **Debriefs:** new `template/agents/prompts/debrief.md`, five close-out questions that both skills
  answer into `agents/state/debriefs/`.

**Tools** (`template/agents/bin/`)

- `tick` refuses any argument other than `daily`, `weekly`, `senses` or `-h` before it reads the
  ceiling or calls the model.
- `act`, `drift` and `note-to-overmind` take `-h` / `--help`, refuse a leading dash, and fold line
  breaks so one call is one line.
- `archive-state` closes an ask only on the owner's quoted words with a closing verb.
- `board`: `board.json` gains a `review` block (last review, days since, debriefs and drift since) and
  `alarms.recent_denies` (hook blocks on attended sessions and classifier denies in the last
  15 minutes; only the drift log's last megabyte is read).

**Mod** (`mods/overlord-board`, 0.2.0)

- Headed blocks (OVERLORD, Priorities, Overmind review, Alarms) that collapse to heading plus first
  lines in a short terminal, with alarm rows reserved first.
- The guard-deny alarm and the review line, from the new `board.json` blocks.
- Size caps: strings cut at 300 characters, lists at 50 entries, hover cards at 500; a file over
  8 MiB is ignored.
- 27 tests.

## 1.0

The first public release: the kit as the README describes it.

- **Plugin 0.1.0:** the `overlord` and `overmind` skills; nine personas (worker, scout, verifier,
  researcher, on-call, security, stakeholder-impact, optimization, design-review); hooks H1, H2 and
  H4 to H7 (H3, the pre-commit hook, not shipped); `check-gates.sh` with 175 cases and its built-in
  tests, 200 passing.
- **Template repo:** the rules, a roadmap with a locked decision log, goals, the home-setup interview
  file, the routing table with the two lists, the state files, the governor loop (`tick`,
  `strategist`) shipping in propose mode behind a fail-closed daily ceiling, senses, session rotation,
  the usage ledger and the board.
- **Settings drop-in:** merges next to your settings, lists the plugin off, and adds deny rules on
  the files that govern the agent.
- **Documents:** guided setup, the first-hour walkthrough, the integrations map and a reconstructed
  example incident.
- **overlord-board mod 0.1.0**, off by default.
