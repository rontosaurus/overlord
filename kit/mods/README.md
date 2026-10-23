# kit/mods — optional Claude Code mods

A mod is a plugin that runs code inside Claude Code (it can draw above the prompt, add a pane, add a command).
Mods here are **optional and off by default**; read one and run `claude plugin validate <folder>` before you load it.

- `overlord-board/` — your work board above the prompt and a `/board` pane, read from the local `board.json` that
  `agents/bin/board` writes. It needs `AGENTS_REPO` set (it never reads or runs anything from the working directory). See its README.
