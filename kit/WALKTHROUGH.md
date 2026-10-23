# Your first hour

No machine has to stay on for any of this. You need Claude Code. The setup session installs the rest
(`git` with Git Bash on Windows, and `jq`), each with a prompt you approve.

- **Windows:** use the desktop app's Code tab with a **Local** session (not WSL — plugins do not load
  there), or a terminal. The hooks have been tested on Linux; on Windows they are checked by the gate
  test at the end of setup, so trust that test, not this sentence.
- **Linux:** the platform the hooks were tested on.
- **macOS:** untested.

## 1. Unpack and run the setup session (about 30 minutes)

Unpack the kit somewhere in your user folder. You get a folder called `hatchery`. Open **that folder**
in Claude Code and say "set me up" (`START-HERE.md` in it says the same). Its `CLAUDE.md` points Claude at
`kit/SETUP.md`, which walks you
through, one step at a time:

1. installing Git (with Git Bash) and `jq` if they are missing — then you restart the app once;
2. copying `template/` to a repo folder of your own (outside the `hatchery` folder, outside OneDrive);
3. five questions: what to call you, **who must never get a message by accident**, which services
   must never be called unattended, whether you use a password-manager command line, and anything
   the agent must never touch. The answers land in `CLAUDE.md`, `agents/guard.conf` and
   `agents/estate.env`;
4. `git init` and a first commit;
5. three lines added to Claude Code's settings — shown to you first (only the lines added), never overwriting
   what you have (`dropin/README.md` explains them). The plugin is listed but **off**;
6. reading the hooks together, in plain words. Then **you** decide whether to turn the plugin on, and
   you do it yourself (`/plugin`, or `claude plugin install hatchery@hatchery` in your terminal);
7. a test where a gate refuses a command that names someone from your list. If it does not refuse,
   setup says so and stops: the gates are off on this machine.

Stop at any step; "continue setup" in a new session picks up where you left off.

Things only you can do, on purpose: install the app and sign in, choose your privacy settings in
your Claude account, approve each prompt (including a Windows admin prompt for Git), decide to turn
the hooks on, and restart the app when asked.

## 2. One page of roadmap (10 minutes)

From now on, open **your repo folder**, not the kit. Open `roadmap/ROADMAP.md`. It has a status table
and a **decision log**: choices you have made and do not want re-argued by an assistant that forgot
the conversation. Write three to start, for example "backups go to the drive in the hall", "nothing
is ever sent to another person without my say-so", "I own the router; the assistant only reads it".
Mark them locked.

## 3. Run `/hatchery:overlord` on one small real task (20 minutes)

Start Claude Code in your repo folder. The overlord stops if `agents/ROUTING.md` is not in the
current folder.

Pick something read-only and useful: "inventory what is running on my home network / my computer."
The overlord will read its state, hand the looking to a scout, and come back with a report.

## 4. Read the report, then check it (10 minutes)

Scroll to the **Attestations** table at the bottom. Choose one row and run its "Verify with" command
yourself. Does it show what the row says it should? That habit is the whole framework in miniature.
Then answer anything the overlord put under its asks. That list is where irreversible things wait
for you.

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
     H7's shell side is a pattern match, not a sandbox: it misses `git checkout/restore/apply/am`, `curl -o`, `wget -O`, `tar -x`/`unzip`, a path held in a variable, a `cd` first, and anything written from inside an interpreter. For real protection make those files read-only to the agent's user.
     Sense scripts run only if they are committed and unchanged since HEAD: commit a new one yourself.
     Keep this repo private: the tick commits what it writes to `agents/state/` (briefs, drift, activity), which
     is a record of your work. Run logs (`agents/state/runs/`) and `senses.tsv` are git-ignored.
  4. Try it by hand: `agents/bin/tick senses`, then `TICK_DRY=1 agents/bin/tick`, then `agents/bin/tick`,
     and read the brief it writes.
  5. Add your own checks yourself, as small executable scripts in `agents/senses.d/` (its README has the format).
  6. Schedule it with the examples in `agents/systemd/` (timer units, or the cron lines).
  7. Put your own targets in `roadmap/goals.md`; the tick ranks work against them. After a week of
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
