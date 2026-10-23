# overlord-board (optional)

A Claude Code **mod** that draws your work board above the prompt and adds a `/board` pane. It is optional: the
framework works the same without it, and the same information is on the page `agents/bin/board` renders.

What it shows, from one local file (`$AGENTS_REPO/agents/state/board/board.json`, written by `agents/bin/board`):

- the **band** above the prompt: `BOARD · now · <next.md> · ctx NNK/150K · <session age>`, then `on deck · week`, your top
  three priorities (coloured by slot), alarm rows, and a foot line `tick · ran · asks · open · ceiling` with a `board`
  button. `150K` is the context size at which the context-watch hook first asks you to wrap up.
- alarms: `✖ board stale` (the board file is older than `OVERLORD_BOARD_STALE_MIN` minutes, default 60 — the board is
  only as fresh as the last time something rendered it), `▲` for rows the board could not parse, work in progress over
  the limits in `agents/state/ceiling.json` (`wip_initiatives`, `ask_backpressure`), arc `DEAD`/`STALE` pills, and a
  `next.md` older than 36 hours.
- `/board` opens a pane: every priority and its next step, the threads waiting on you (`tag` = `owner` in
  `threads.md`), every ask, what ran unattended in the last 24 hours, the morning brief's head, and spend.
- `/board refresh` runs `agents/bin/board` once (the only thing the mod ever runs), then opens the pane.

It spends no model tokens, writes nothing, and uses no network: all parsing of your state files stays in
`agents/bin/board` (tested in `agents/bin/test_board.py`); the mod only reads the JSON it wrote. If the file is missing
or is not JSON, the band is simply empty and the pane says where it looked.

**Where it draws:** in the terminal, the Desktop app and the VS Code extension. Not on a phone or in a Remote Control
client — the hooks run, but what a mod draws appears only on the machine's own screen. The rendered page is the view
for everywhere else.

## Settings (environment variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `AGENTS_REPO` | (required) | your repo's folder. The board file and `agents/bin/board` are taken from here and **never from the working directory** (a folder you merely opened cannot plant a board or a script). Unset: the mod reads and runs nothing, and the pane says so. The kit's settings drop-in sets it |
| `OVERLORD_BOARD_FILE` | `$AGENTS_REPO/agents/state/board/board.json` | the board file; honoured only as an absolute path |
| `OVERLORD_BOARD_STALE_MIN` | `60` | minutes before the band says the board is stale |
| `OVERLORD_BOARD_PYTHON` | `python3` | the interpreter `/board refresh` uses (`python` or `py` on some Windows installs) |

To keep the board fresh without thinking about it, render it from the tick, a timer, or a settings hook — the mod will
pick up the new file within a minute.

## Install

A mod is code that runs with your permissions, so it ships **off**. Read it first (`hooks/register.tsx` is one file,
about 200 lines), then list what it does with `claude plugin validate kit/mods/overlord-board` — the `calls:` line shows
`$.fs.read` (the board file), `$.process.run` (only for `/board refresh`) and the interface calls; nothing else.

Load it for one session: `claude --plugin-dir <path to kit/mods/overlord-board>`. To load it every session, add the
folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of your `~/.claude/settings.json` (absolute paths joined with `:`,
`;` on Windows), keeping any keys already there, and start a new session. Off-switch: remove the entry.

## Tests

```
claude plugin validate kit/mods/overlord-board
claude plugin test kit/mods/overlord-board
```

`hooks/register.test.tsx` has ten tests (distilling, the band, the pane, a missing or malformed file, stale and
work-in-progress alarms, the path override, `/board refresh`). They need a Claude Code recent enough to have the
`plugin validate` and `plugin test` subcommands (checked with 2.1.306); older versions simply skip the mod.
