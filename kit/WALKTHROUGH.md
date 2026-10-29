# After setup: your first hour

You have run the setup session (`START-HERE.md` step 3). It made a repo folder of your own from
`template/`, wrote your answers into it, added three settings lines next to yours, and left the plugin
**off** until you read the hooks and turned it on yourself. If you stopped before that, say "continue
setup" in the `hatchery` folder. Platforms and what the gates cannot see are in `README.md` § Security.

From here, open **your repo folder**, not the kit, and type `/hatchery:overlord`. Nothing needs to stay
on for any of this.

## 1. Tell the overlord what you have (about 10 minutes)

The first time, the overlord asks about your home setup and writes `roadmap/home-setup.md`: what you
have (router, NAS, smart-home hub and so on, from a list of examples), who depends on it, quiet hours,
what is always on, and for each thing whether the agents may `read` it, `manage` it, must `ask` first,
or must `never` touch it. "I don't know" is a fine answer. Edit the file any time; a row you delete
is a thing the agents stop assuming exists.

## 2. One page of roadmap (10 minutes)

Open `roadmap/ROADMAP.md`. Its **decision log** holds choices you do not want re-argued by an assistant
that forgot the conversation. Write three to start (the file has examples to adapt) and mark them locked.

## 3. One small real task (20 minutes)

Pick something read-only and useful: "inventory what is running on my home network / my computer", or
"check the table in `home-setup.md` against what is really there". The overlord will read its state,
hand the looking to a scout, and come back with a report. (The overlord stops if `agents/ROUTING.md` is
not in the current folder.)

## 4. Read the report, then check it (10 minutes)

Scroll to the **Attestations** table at the bottom. Choose one row and run its "Verify with" command
yourself. Does it show what the row says it should? That habit is the whole framework in miniature.
Then answer anything the overlord put under *Ask the owner* in `agents/state/overlord.md`: that table
is where irreversible things wait for you.

# Later

- **Add to your never-message list** whenever someone new should be on it: edit
  `agents/guard.conf`, then check it from your repo:
  `bash <kit>/plugin/hooks/check-gates.sh --live "message NAME"` (`<kit>` = `hatchery/kit`) must print `BLOCKED`. Plain
  `check-gates.sh` tests the shipped cases with a temporary config, not yours; only `--live` proves
  your own pattern.
- **A newer kit:** unpack it over the same `hatchery` folder, keeping that name (your settings point
  at that path; files the new kit dropped stay behind, which is harmless). The plugin loads in place
  from that folder, so `/reload-plugins` (or a restart) picks up the new hooks; if `/plugin` offers
  an update for hatchery, take it. Then run setup step 7's gate test again. Your repo is a separate
  folder and is never touched by an unpack.
- **Re-tune the band:** if you load the `overlord-board` mod, edit `agents/board-mod.json` in your repo; every key is
  optional. Setup wrote it from your answers (if it is not there, copy `<kit>/template/agents/board-mod.json.example`). The keys
  (the title, what goes first, how many priority rows, alarms as one line or in full, the foot fields) are listed in
  `<kit>/mods/overlord-board/README.md`. A key the mod cannot use is ignored on its own and the rest still apply, and the mod
  reads the file again every minute, so you can change it while a session is open.
- **The overmind review** comes after the first month, not before. Run `/hatchery:overmind` and it
  reads what the framework did. Its procedure handles empty state: "nothing to review yet" is a fine
  result.
- **When you have an always-on machine**, you can schedule the governor loop. Do it
  yourself, one step at a time (the `agents/senses.d/` scripts, the systemd unit or crontab and `ceiling.json` are
  yours to write; the agent is kept from editing them):
  1. It needs `python3`, `git` and the `claude` CLI.
  2. Edit `agents/state/ceiling.json` yourself, outside the agent: the daily budget (`daily_usd` and `daily_turns`; there is
     no default). A missing, corrupt or non-positive budget makes the tick refuse to run. Leave `tick_mode` at `propose` for the first
     week. The claude executable and the notify command are NOT read from this file: set `HATCHERY_CLAUDE_BIN`
     and (optionally) `HATCHERY_NOTIFY_CMD` and `HATCHERY_CLAUDE_ARGS` in the systemd unit or cron line (see `agents/systemd/`). The unit file and crontab must not be writable by the agent's user. The Edit/
     Write deny rules from setup step 5 and the Bash hook keep the agent from changing `ceiling.json`,
     `agents/bin`, `agents/senses.d`, `agents/prompts`, `guard.conf`, `estate.env` and `.claude/`.
  3. Headless runs cannot answer permission prompts. In your repo's `.claude/settings.json` (`permissions.allow`)
     allow read-only commands and the specific scripts the tick needs, **by name** - for example
     `Bash(agents/bin/tick senses)`, `Bash(agents/bin/drift:*)`, `Bash(agents/bin/act:*)` - not `agents/bin/*`.
     Do not skip permissions: the tick refuses `--dangerously-*` / `bypassPermissions` in
     `HATCHERY_CLAUDE_ARGS` unless the unit sets `HATCHERY_ALLOW_SKIP_PERMISSIONS=1` (not recommended), and it also
     refuses `--settings`, `--setting-sources`, `--mcp-config`, `--plugin-dir`, `--add-dir`, `--allowedTools` and `--bare`.
     It will not run while `ceiling.json`, `agents/bin`, `agents/prompts` or `guard.conf` differ from the last commit.
     H7's shell side is a pattern match, not a sandbox (what it misses is in `agents/ROUTING.md`, H7): make those files read-only to the agent's user.
     Sense scripts run only if they are committed and unchanged since HEAD: commit a new one yourself.
     Keep this repo private: the tick commits what it writes to `agents/state/` (briefs, drift, activity), which
     is a record of your work. Run logs (`agents/state/runs/`) and `senses.tsv` are git-ignored.
  4. Try it by hand: `agents/bin/tick senses`, then `TICK_DRY=1 agents/bin/tick`, then `agents/bin/tick`,
     and read the brief it writes.
  5. Add your own checks yourself, as small executable scripts in `agents/senses.d/` (its README has the format and a "if you listed X" table of ideas keyed to `home-setup.md`).
  6. Schedule it with the examples in `agents/systemd/` (timer units, or the cron lines).
  7. Put your own targets in `roadmap/goals.md` (it has examples with signals); the tick ranks work against them. After a week of
     briefs you agree with, set `tick_mode` to `act`.

# Turning it off

- **`/plugin` → hatchery → disable** (or `claude plugin disable hatchery@hatchery`) → the hooks and
  commands stop; the repo still works as plain files.
- **Remove `agents/estate.env`** → the gates go inert, even with the plugin on.
- **Take the three settings lines out**: restore the `settings.json.before-hatchery-…` backup the
  setup made, or delete the `hatchery` entries and `AGENTS_REPO` by hand. Once you are happy with
  setup, delete that backup anyway: it is a full copy of your settings and may hold tokens.
- **`claude plugin uninstall hatchery@hatchery`** → the plugin is gone.
- **Delete the repo folder** → everything is gone.

While `AGENTS_REPO` is set and the plugin is on, the gates apply in every Claude Code session on this
machine, not only in your repo. Without `AGENTS_REPO` they still apply in any session opened in a
folder that has `agents/estate.env`.
