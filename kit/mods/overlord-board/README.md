# overlord-board (optional)

A Claude Code **mod** that draws your overlord board above the prompt and adds a `/board` pane. It is optional: the
framework works the same without it, and the same information is on the page `agents/bin/board` renders.

It is a **base template**: with no setup it draws a sensible default band, and one small optional file,
`agents/board-mod.json`, changes the layout (what goes first, how many priority rows, how alarms are shown, what the
foot says, the title). Setup (`SETUP.md` step 8) asks a few questions and writes that file for you; every key is
described under [Configuration](#configuration) below.

What it shows, from one local file (`$AGENTS_REPO/agents/state/board/board.json`, written by `agents/bin/board`):

- the **band** above the prompt, built from four blocks in the order you choose (default: priorities, roles, alarms,
  review) and a foot row:
  - **priorities**: your top ranked rows, coloured by slot, each as `<#> <slot> · <next step>`. The hover card keeps
    the whole row (what it is and the next step).
  - **roles**: the title line `<spinner> OVERLORD · ctx NNK/150K · <session age> · today ≈$N.NN` (the spinner turns while
    the session is working; `150K` is the context size at which the context-watch hook first asks you to wrap up; the
    spend is today's attended spend from the board's ceiling block), then `now · <next.md>` when the board carries a
    parsed `next.md`. A tall band adds `on deck · … · week · …` and a `running · <id> <status> · …` line (the initiatives
    whose overseer is running now).
  - **alarms**: one line (`▲ 3 alarms: board stale · WIP · arc`, a cross instead of the triangle when one of them
    is blocking) or every alarm row, per `alarms` below. The one-line form keeps the full rows in its hover card.
  - **review**: one line (`review · last <date> · N days ago · N debriefs since`), only when `notes-to-overmind.md`
    exists so that `board.json` has a review block.
  - the **foot**: the fields you list (default `asks · open · today · tick`) and a `board` button that opens the pane.
- A short band has no headings; a **tall** band (at least `full_rows` rows to draw in, 12 by default) draws a heading rule
  over each block, every alarm row and the extra roles lines. In a band too short for everything, every block keeps its
  first few lines (the largest count that fits, never below one), then whole blocks from the bottom go; the alarm rows
  are reserved first, so a short band loses lines and then blocks before it loses an alarm. A row wider than the band
  ends in `…` and shows its full text in a card while the pointer is on it.
- alarms: `✖ board stale` (the board file is older than `stale_minutes` / `OVERLORD_BOARD_STALE_MIN`, default 60 — the
  board is only as fresh as the last time something rendered it), `▲` for rows the board could not parse, work in
  progress over the limits in `agents/state/ceiling.json` (`wip_initiatives`, `ask_backpressure`), arc `DEAD`/`STALE`
  pills, a `next.md` older than 36 hours, and `▲ N guard deny(s) on attended sessions in the last 15 min — see
  state/drift.log` (the hooks' `hook-block` lines from sessions you are attending, plus `classifier-deny` lines, from
  `drift.log`).
- `/board` opens a pane under headings, one item per line: every priority and its next step, the roles section, the
  Overmind review line, the threads waiting on you (`tag` = `owner` in `threads.md`), every ask, the alarms, what ran
  unattended in the last 24 hours, the morning brief's head, and spend. The pane is the full view: its first four
  sections follow your `order`, then the rest in their usual order, and a block the band leaves out (or alarms you turned
  `off` in the band) is still listed there.
- `/board refresh` runs `agents/bin/board` once (the only thing the mod ever runs), then opens the pane.

The default band for a board with a review block and two alarms, short (8 rows) and then tall (14 rows):

```
  1 reply · reply "go #1"
  2 tap · open the registrar
  OVERLORD · ctx 34K/150K · 5m · today ≈$0.50
  now · reply to ask #1, daytime
▲ 2 alarms: parse errors · guard denies
  review · last … · 11 days ago · 2 debriefs since
asks 2 · open 2 · today ran 1 · all ≈$1.57 · tick …          board
```

```
── Priorities ──────────────────────────────────
  1 reply · reply "go #1"
  2 tap · open the registrar
── Roles ───────────────────────────────────────
  OVERLORD · ctx 34K/150K · 5m · today ≈$0.50
  now · reply to ask #1, daytime
── Alarms ──────────────────────────────────────
▲ board could not parse 1 row(s) of the state files
▲ 2 guard deny(s) on attended sessions in the last 15 min …
── Overmind ────────────────────────────────────
  review · last … · 11 days ago · 2 debriefs since
asks 2 · open 2 · today ran 1 · all ≈$1.57 · tick …          board
```

The mod cuts what it keeps from `board.json` (300 characters a string, 50 entries a list, 500 for a hover card; a file
over 8 MiB is ignored) and strips control characters, but it relies on `agents/bin/board` to remove invisible and
bidirectional format characters, so a file chosen with `OVERLORD_BOARD_FILE` is the owner's responsibility.

It spends no model tokens, writes nothing, and uses no network: all parsing of your state files stays in
`agents/bin/board` (tested in `agents/bin/test_board.py`); the mod only reads the JSON it wrote. If the board file is
missing or is not JSON, the band is simply empty and the pane says where it looked.

**Where it draws:** in the terminal, the Desktop app and the VS Code extension. Not on a phone or in a Remote Control
client — the hooks run, but what a mod draws appears only on the machine's own screen. The rendered page is the view
for everywhere else.

## Configuration

`agents/board-mod.json` in your repo (`$AGENTS_REPO/agents/board-mod.json`) is **optional**, and so is every key in it.
`agents/board-mod.json.example` (in the template) holds the defaults; copy it and change what you like, or let setup write
it from a few questions. It is plain JSON (no comments), layout only: no secret belongs in it, and it is fine to commit.
It is not one of the files the agents are blocked from editing; if you would rather an agent could not retune your band,
add it to your deny rules.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `title` | string, 1 to 40 characters | `"OVERLORD"` | The first word of the roles line (and the heading of the roles section in the pane). Control characters and `*` / backticks are removed; a longer or empty one is ignored |
| `order` | list of `"priorities"`, `"roles"`, `"alarms"`, `"review"` (at most 8 entries) | `["priorities", "roles", "alarms", "review"]` | Which blocks the band draws, top to bottom. **A block that is not listed is not drawn.** A name outside the four refuses the whole list (so a typo cannot silently hide a block); repeats are dropped. `[]` draws the foot only |
| `priorities_rows` | whole number, 0 to 10 | `3` | How many ranked rows the priorities block shows. The pane always lists all of them |
| `alarms` | `"auto"`, `"count"`, `"full"`, `"off"` | `"auto"` | `auto`: one count line in a short band, every alarm row in a tall one. `count`: always the one line. `full`: always every row. `off`: none in the band (the pane still lists them) |
| `full_rows` | whole number, 1 to 99 | `12` | A band with at least this many rows to draw in (the foot row counts; the terminal's allowance less the one row the prompt keeps) is *tall*: headings, `auto` alarms in full, and the extra roles lines (`on deck · week`, `running`) draw |
| `foot` | list from `"asks"`, `"open"`, `"today"`, `"tick"`, `"ceiling"` (at most 8) | `["asks", "open", "today", "tick"]` | The foot row, in this order, joined by ` · `. `asks`: open asks. `open`: open initiatives. `today`: `today ran N · all ≈$X` (unattended actions in the last 24 hours, and attended plus unattended spend today; the spend only when the board has a ceiling block). `tick`: the last tick. `ceiling`: unattended spend against the daily ceiling. `[]` leaves the `board` button alone on the row |
| `stale_minutes` | whole number, 1 to 10080 | `60` | Minutes before the band says the board is stale. If absent, `OVERLORD_BOARD_STALE_MIN` applies, then 60. Raise it if you render the board rarely; lower it if a timer renders it every few minutes |
| `show_subagents` | `true` or `false` | `true` | The `running · …` line of the roles block (tall band only): the initiatives whose overseer is running now, read from the board's `running` cards |
| `board_file` | path inside your repo, at most 120 characters | `"agents/state/board/board.json"` | Where the mod reads the board, relative to `AGENTS_REPO`. Absolute paths, `..`, backslashes and drive letters are ignored. An absolute `OVERLORD_BOARD_FILE` in your environment still wins. It changes only where the mod reads: `agents/bin/board` and `/board refresh` still write the default place |

**What happens to a bad file.** Nothing breaks and nothing stops: the mod falls back to the defaults, key by key. A missing
file, text that is not JSON, JSON that is not an object, and a file over 64 KiB (it is not parsed at all) give the
defaults for every key. Unknown keys are ignored. A key of the wrong type, out of its range, or not one of its allowed
names is ignored on its own, and the other keys still apply. The file is read again every minute, so an edit shows in the
band without a restart.

**The order of the band.** With the default `order` the band reads, top to bottom: your priorities, who is working and
what is happening, alarms, the review line, then the foot. To put the roles first, list them first
(`["roles", "priorities", "alarms", "review"]`); to hide a block, leave it out. The alarms are placed like any other block,
but they are never the part that gets cut when the band is short.

## Settings (environment variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `AGENTS_REPO` | (required) | your repo's folder. The board file, `agents/board-mod.json` and `agents/bin/board` are taken from here and **never from the working directory** (a folder you merely opened cannot plant a board, a config or a script). Unset: the mod reads and runs nothing, and the pane says so. The kit's settings drop-in sets it |
| `OVERLORD_BOARD_FILE` | `$AGENTS_REPO/agents/state/board/board.json` | the board file; honoured only as an absolute path, and it beats `board_file` |
| `OVERLORD_BOARD_STALE_MIN` | `60` | minutes before the band says the board is stale; the `stale_minutes` key beats it |
| `OVERLORD_BOARD_PYTHON` | `python3` | the interpreter `/board refresh` uses (`python` or `py` on some Windows installs) |

To keep the board fresh without thinking about it, render it from the tick, a timer, or a settings hook — the mod will
pick up the new file within a minute.

## Install

A mod is code that runs with your permissions, so it ships **off**. Read it first (`hooks/register.tsx` is one file,
about 560 lines), then list what it does with `claude plugin validate kit/mods/overlord-board` — the `calls:` line shows
`$.fs.read` (the board file and the config), `$.process.run` (only for `/board refresh`) and the interface calls; nothing
else.

Load it for one session: `claude --plugin-dir <path to kit/mods/overlord-board>`. To load it every session, add the
folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of your `~/.claude/settings.json` (absolute paths joined with `:`,
`;` on Windows), keeping any keys already there, and start a new session. Off-switch: remove the entry.

## Tests

```
claude plugin validate kit/mods/overlord-board
claude plugin test kit/mods/overlord-board
```

`hooks/register.test.tsx` has 51 tests (distilling; the band and the pane; the default layout at 8 and at 14 rows; every
config key, each invalid value ignored on its own, an oversize or hostile config; the order, the alarm modes, the foot and
the roles block; how a short band collapses the blocks and keeps the alarms; the review line, the guard-deny alarm, a
missing or malformed file, stale and work-in-progress alarms, the path overrides, the size limits, `/board refresh`).
They need a Claude Code recent enough to have the `plugin validate` and `plugin test` subcommands (checked with 2.1.306);
older versions simply skip the mod.
