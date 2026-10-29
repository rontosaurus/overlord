# kit/mods — optional Claude Code mods

A mod is a plugin that runs code inside Claude Code (it can draw above the prompt, add a pane, add a command).
Mods here are **optional and off by default**; read one and run `claude plugin validate <folder>` before you load it.

- `overlord-board/` — your overlord board above the prompt and a `/board` pane, read from the local `board.json` that
  `agents/bin/board` writes. It needs `AGENTS_REPO` set (it never reads or runs anything from the working directory). See its README.
  A base template: four blocks (priorities, roles, alarms, the overmind review line) and a foot row, laid out by an
  optional `agents/board-mod.json` (order, priority rows, one-line or full alarms, foot fields, title) that setup writes
  from a few questions and that you can edit any time; with no file it uses its defaults. A short band has no headings
  and one alarm count line; a tall one has headings, every alarm row and the extra lines. Includes an alarm for guard
  denies on attended sessions in the last 15 minutes. The README's Configuration table lists every key.
