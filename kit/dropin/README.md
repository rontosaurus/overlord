# dropin/ — the settings lines, added without overwriting

Claude Code reads your personal settings from `~/.claude/settings.json` (on Windows
`C:\Users\<you>\.claude\settings.json`). This kit needs three lines there, plus a set of deny rules. Nothing here is copied
over that file; `merge-settings.sh` adds the lines next to what you already have.

| File | What it is |
|---|---|
| `hatchery-settings.json` | The three lines and the deny rules, with `@KIT@` / `@REPO@` (and `@KITDENY@` / `@REPODENY@` inside the rules) where your two folder paths go. |
| `merge-settings.sh` | Fills in the paths and adds only the entries you do not have, in place. Prints only those entries, never your other values (settings can hold tokens). Dry run unless you add `--apply`; keeps a dated backup (delete it when you are happy); refuses a file it cannot parse; where you already have a value, yours wins. Needs bash and jq. |

The three lines:

- `extraKnownMarketplaces.hatchery` — where the kit's plugin lives. Makes it *available*, nothing more.
- `enabledPlugins."hatchery@hatchery": false` — listed and **off**. You turn it on, after reading
  `plugin/hooks/`.
- `env.AGENTS_REPO` — your repo's path, so the hooks find your rules from any session.
- `permissions.deny` — no Edit/Write of: your user `settings.json` / `settings.local.json`, `~/.claude/plugins/`, the
  plugin's `hooks/` folder, and in your repo `agents/state/ceiling.json`, `agents/guard.conf`, `agents/estate.env`,
  `agents/bin/`, `agents/senses.d/`, `agents/prompts/`, `agents/state/costs.tsv` and `.claude/` in the repo, plus `~/.claude.json` and `~/.config/systemd/`. A deny rule holds in every permission
  mode (bypass included), and the hooks cannot protect themselves: an agent that could rewrite them, the settings
  that load them, or the ceiling and scripts the unattended tick runs would hold the gates in its own hand.
  These rules cover Claude Code's editor tools only. A shell write to the same paths (`>`, `sed -i`, `cp`, `mv`,
  `tee`, `chmod`, ...) is refused by the Bash hook (gate H7) - a pattern match, not a sandbox: it does not see a
  write made from inside an interpreter or after a `cd`. Edit those files yourself, outside the agent. Rules you
  already have are kept; only missing ones are appended. After applying, open `/permissions` in a session and
  check the rules show up with the right paths (path syntax differs a little between systems; `//` starts an
  absolute path).

**Optional, yours to add** (the kit cannot know your connectors): a deny rule for every tool that can send
something to another person, in the same `permissions.deny` list - for example your mail connector's
send/reply/forward tools or a chat connector's post tool, written `mcp__<server>__<tool>` (the exact names
show in `/permissions`). This is the "deny" list: those calls fail in every mode. The hooks' own list
(`agents/guard.conf`) is the "ask" side: things that prompt you when you are at the keyboard.

`SETUP.md` step 5 runs it with you. By hand, from the `kit/` folder (inside `hatchery`):

```
bash dropin/merge-settings.sh --kit . --repo ../home-ops            # look
bash dropin/merge-settings.sh --kit . --repo ../home-ops --apply    # write
```

To take the lines out again: restore the backup it printed (`settings.json.before-hatchery-…`), or
delete the three entries by hand.
