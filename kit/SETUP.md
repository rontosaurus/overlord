# Setup — the guided first session

**For Claude.** The owner opened a Claude Code session in the unpacked `hatchery` folder (it holds
`START-HERE.md`, `kit/`, and a `LETTER.md` in some editions) and asked to set it up. **Every path below is inside `kit/`**
(`plugin/` is `kit/plugin/`), and "the kit" means that `kit/` folder; commands run from the `hatchery` folder, so
they spell `kit/` out. Walk them through the steps below, one
at a time, in plain words. They have never done this before; you are a patient guide, not
an installer.

Ground rules for the whole session:

- **Every command goes through the normal permission prompt.** Say what a command does before you
  run it. Never ask for prompts to be turned off, never use a bypass flag, never use `sudo`/admin
  yourself — an admin prompt is theirs to approve.
- **Each step starts with its check.** If the check already passes, say so in one line and move on.
  That makes the session safe to stop and resume: "continue setup" in a new session starts again at
  the top and skips what is done.
- **Never overwrite their files.** Not `settings.json`, not an existing folder, not a `CLAUDE.md`.
- **You never turn the plugin on.** Step 6 is theirs.
- One question at a time. "Skip" and "stop" are always answers.
- Nothing in this session sends anything to anyone or touches the network beyond the two installs in
  step 1.

## 0. Before anything

1. Ask whether they have read `START-HERE.md` (and `LETTER.md`, if the `hatchery` folder one level up has
   one) and done the privacy check in its step 2. If not: point them to it and stop here. The kit
   waits for that.
2. Say in one line that this setup is for their home: personal account and machine only.
3. Tell them the plan in six lines: install two tools → make their own repo folder → a short
   interview → add three lines to Claude Code's settings (shown first) → they read the safety hooks
   and decide whether to turn them on → a test that shows a gate refusing a command.

## 1. Tools: Git (with Git Bash) and jq

**Check:** `git --version` and `jq --version` both print a version, and your shell tool is Bash
(on Windows that means Git Bash).

If something is missing:

- **Windows:** run these, one at a time, from whatever shell you have (the PowerShell tool before
  Git is installed):
  - `winget install --id Git.Git -e --source winget`
  - `winget install --id jqlang.jq -e --source winget`
  Say first: Git for Windows brings Git Bash, which the safety hooks need — without it they are
  silently off. jq lets the hooks read what Claude is about to run. The Git installer may show a
  Windows admin prompt; that click is theirs.
  Then: **they close and reopen the Claude app** (a new program is only found by a freshly started
  app), open the `hatchery` folder again and say "continue setup".
- **If you have no shell tool at all, or `winget` is not found:** give them the two `winget` lines
  to type themselves in a Windows Terminal, then restart the app and say "continue setup". (On a
  brand-new Windows account `winget` can take a few minutes to appear; the Microsoft Store's "App
  Installer" provides it.)
- **Linux / macOS:** name the package (`git`, `jq`) and the command for their system; they run it
  themselves if it needs `sudo`.

## 2. Their repo folder

**Check:** they name an existing folder that holds `agents/ROUTING.md` (a previous run made it).

Otherwise ask where it should live. Suggest `home-ops` in their user folder (on Windows
`C:/Users/<them>/home-ops`). It must be **outside the `hatchery` folder** (a newer kit is unpacked over this
one) and, on Windows, **outside a OneDrive-synced folder** (Documents and Desktop often are). If the
folder exists and is not empty, stop and ask for another name — never copy over it.

Copy the kit's `template/` folder to it (`cp -r kit/template "<repo>"`). Show `ls` of the result.

## 3. A short interview (five questions, writes three files)

Ask one at a time. For each, **say what it is for, give the examples, and offer the suggested default**
so they never answer from a blank page; write only what they choose. "Skip" and "none" are answers.

1. **What should I call you?** Examples: a first name or a nickname. Suggest: the first name they use
   in this chat. → replaces `<your-name>` in `<repo>/CLAUDE.md` (and in `agents/ROUTING.md` and
   `roadmap/ROADMAP.md` where it appears).
2. **Who must never get a message from an agent by accident?** Examples: a partner, a child, a
   housemate, a family group chat, a team or club channel, a work chat, a mailing list. Suggest: everyone
   they live with and any group chat they are in; adding a name is free, and `WALKTHROUGH.md` § Later
   says how to loosen it. Explain: the H1 gate refuses any command that names them, so pick names that
   appear only in a send (a device name like `pat-phone`, a channel or chat name, an address); a bare
   first name also blocks reading files that mention the person. → `agents/guard.conf`, copied from
   `guard.conf.example`, `H1_PATTERNS='name1|name2'`. At least one entry; an empty one turns H1 off.
3. **Is there a service whose API changes things you cannot undo?** Examples: the DNS provider or
   registrar for a domain they own, a cloud backup or storage service, their router maker's cloud
   console, a payment or banking API. Suggest: *none* if they own no domain or such account, and
   say that is fine. Otherwise the API hostname of each (offer to look it up in the provider's docs).
   → `H4_PROVIDER_HOSTS` in the same file; reads pass and writes ask. Leave the example value if
   unsure. Also set `H4_ASK_PATTERNS` to empty unless they name their own "my hand" command (a deploy
   script, a production cluster): the example value is a placeholder.
4. **Where do your passwords live, and does it have a command-line tool?** Examples: a browser or
   phone password manager (no CLI), or one with a CLI (`op`, `pass`, `gopass`, `rbw`). Suggest: write
   the manager's name in `CLAUDE.md` under "Where secrets live" (a pointer, never a secret), and leave
   `SECRET_CLI=` empty in `agents/estate.env` (copied from `estate.env.example`) unless they have a CLI
   and want H2 to guard it.
5. **What is irreplaceable, or must the agents never touch?** Examples: the photo library folder,
   scanned documents, tax and finance records, family videos, anything that exists in only one place;
   a door lock or alarm. Suggest: the folders that hold the only copy of anything. → folder paths into
   `H4_NEVER_PATHS` in `guard.conf` (an agent cannot delete these even with a tap, so choose them with
   care), plus one line under "Rules that do not bend" in `CLAUDE.md`, their words. Devices (locks,
   alarms, cameras) are not paths: they go in `roadmap/home-setup.md` as `never`, which the first overlord
   session asks about, so just note them for it.

Everything else about their home is for the first overlord session, which starts with the home-setup
interview (`roadmap/home-setup.md`: what they have, who depends on it, quiet hours, what is always on,
and what the agents may do with each thing). Do not ask any of that here. Show them the three files
when done.

## 4. git init and the first commit

**Check:** `git -C "<repo>" log --oneline -1` prints a commit.

In the repo: `git init`, then — only if `git config user.name` is empty — ask what name and email
they want on their own commits (any address works; nothing is pushed anywhere) and set them with
`git config` **inside this repo only**. Then `git add -A` and `git commit -m "setup: first commit"`.
Explain: every change the agents make from now on is a commit they can look at and undo.
`agents/estate.env` is in `.gitignore` on purpose.

## 5. Three lines in Claude Code's settings (shown first)

**Check:** `bash kit/dropin/merge-settings.sh --kit kit --repo "<repo>"` prints `nothing to add`.

Run the same command without `--apply` first. It never overwrites: it reads their
`~/.claude/settings.json` (if any), keeps every line they have in place, and prints only the entries
it would add — never their other values (a settings file can hold tokens). Do not `cat` their
settings file yourself, for the same reason. Explain the three lines and the deny rules:

- `extraKnownMarketplaces.hatchery` — tells Claude Code where this kit's plugin lives (the `kit/` folder).
  It only makes the plugin *available*.
- `enabledPlugins."hatchery@hatchery": false` — listed, and **off**. Turning it on is step 6, theirs.
  If they already have it listed, the script keeps their value.
- `env.AGENTS_REPO` — the path of their repo, so the hooks know where their rules live. If they
  already have an `AGENTS_REPO`, the script keeps theirs and says so.
- `permissions.deny` — rules that stop Claude Code's Edit and Write tools from changing the files that
  govern the agent (their user settings, the plugin's hooks, and in their repo `ceiling.json`,
  `guard.conf`, `estate.env`, `agents/bin/`, `agents/senses.d/`, `agents/prompts/` and `.claude/`;
  `dropin/README.md` has the full list). Rules they already have are kept.

On their yes, run it again with `--apply`. It keeps a dated backup of the old file next to it; tell
them to delete that backup once they are happy, since it is a full copy of their settings.
If it says `REFUSED` (their file has comments or a typo), show them the three lines and let them
paste them in by hand — do not rewrite their file.
Then, if `claude` is on the PATH, run `claude plugin marketplace add "<path to hatchery>/kit"` (it recognises
the entry just written) and `claude plugin list --available`: `hatchery@hatchery` shows as
available, not installed.

## 6. They read the hooks, then decide

**Check:** `claude plugin list` shows `hatchery@hatchery` with `Status: ✔ enabled` — or, if
`claude` is not on the PATH (desktop app only), `jq '.enabledPlugins["hatchery@hatchery"]'
~/.claude/settings.json` prints `true`, or they tell you what `/plugin` shows.

Open `plugin/hooks/hooks.json` and each script it names, one at a time, and explain in plain words:
what starts it, what it reads, what it refuses, what it writes. The short version to check yourself
against:

- `guard-bash.sh` — before every shell command: refuses a command that names someone in H1; with a
  password-manager CLI set, refuses the "list everything" shape that prints secrets (H2); in an
  unattended run (`AGENT_ROLE` set) refuses irreversible command shapes (H4). When it refuses, it
  runs their repo's own `agents/bin/drift` to log one line in `agents/state/drift.log` — only for
  the repo named in `AGENTS_REPO`, never for some other folder a session happens to be opened in.
- `guard-tools.sh` — the same H1 check (and the same log line) on connector (`mcp__…`) and
  web-fetch calls.
- `session-start.sh` / `session-end.sh` — write and remove one small file per session under
  `agents/state/sessions/` so two sessions can see each other. Nothing else.
- `context-watch.sh` — a notice when a session gets long. Never blocks.
- `check-gates.sh` — the test runner; nothing calls it but you.

Point out: config files are read as text and never run; with no `agents/estate.env` they do nothing;
a folder that is not their `AGENTS_REPO` but has an `agents/estate.env` turns the gates on for
sessions opened there, read-only — nothing in it is run, nothing is written into it;
they are pattern matches that catch mistakes, not a vault door. Then ask whether they want to turn the
plugin on, and stop until they answer. **They** turn it on — either `/plugin` → hatchery →
install/enable, or `claude plugin install hatchery@hatchery` typed in their own terminal — then run
`/reload-plugins` or restart the app. You do not run the install or enable command for them, and
you tell them so in these words: "If I ever ask permission to run `claude plugin install` or
`enable`, the answer is no — you type it yourself."

If they say no, or not yet: that is a finished answer. The repo, the overlord's rules and the path
still work without the plugin; only the gates and the `/hatchery:…` commands wait.

## 7. Watch a gate refuse something

Stay in this session once the plugin is on and reloaded (or, after a restart, reopen the
`hatchery` folder and say "continue setup"). On Windows this must be the desktop app's Code tab, a **Local**
session — not WSL, where plugins do not load. This session's folder is `hatchery`, not their repo, so
step 4 below also proves the settings line `AGENTS_REPO` reaches the hooks. Run:

1. `bash "<kit>/plugin/hooks/check-gates.sh"` (`<kit>` = `hatchery/kit`) → ends `N passed, 0 failed`.
2. `AGENT_ROLE=overseer bash "<kit>/plugin/hooks/check-gates.sh" --live "git push"` → `BLOCKED`.
3. `bash "<kit>/plugin/hooks/check-gates.sh" --live "send to <one of their H1 names>"` → `BLOCKED`;
   `--live "list files"` → `allowed`.
4. The real one: try to run `echo <one of their H1 names>` as a shell command. The hook must refuse
   it before it runs. (Only possible once step 6 is done.) If it runs instead, do not stop yet: have
   them open a session in **their repo folder** and try the same `echo` there.
   - Refused there: the gates work in their repo, which is where they will work; only the
     machine-wide reach (the settings `AGENTS_REPO` line) does not reach the hooks on this machine.
     Say so plainly, carry on, and consider filing an issue on the repo.
   - Runs there too: the gates are off on this machine — stop and say so. The most likely causes
     are no Git Bash, no jq, or the plugin not enabled.

## 8. Board (optional)

**Check:** `agents/state/board/index.html` exists in their repo (the board has been rendered), and, if they have already
answered the band questions below, so does `agents/board-mod.json`. If both are there, say so in one line and move on.

If `python3 --version` (Windows: `python` or `py`) works: `cd "<repo>" && python3 agents/bin/board`, then
open `agents/state/board/index.html` in their browser. It is a read-only local page drawn from the state
files; nothing is served. The `overlord-board` mod in `mods/` draws the same view above the prompt — it is
off by default; show them `mods/README.md` and let them decide. No Python is fine; skip this step.

**The band's layout (five short questions).** The mod is a base template: with no setup at all it draws a sensible
default band, and one optional file in their repo, `agents/board-mod.json`, shapes it. Ask once: "A few questions shape
what the band shows above the prompt. Each has a default, so pressing Enter keeps it. It only matters if you load the mod,
and you can change the answers any time. Go through them?" On no or skip, write nothing: the mod uses its defaults. If
`agents/board-mod.json` already exists, never overwrite it: show it and move on (it is theirs to edit). Otherwise ask one at
a time, saying the default each time, and keep to the ranges (ask again on a value outside them):

1. **What goes first above the prompt: your priorities, or who is working?** (the "roles" line: the title, how full the
   session's context is, its age and today's spend). Default: priorities. Priorities first is
   `"order": ["priorities", "roles", "alarms", "review"]`; roles first is `["roles", "priorities", "alarms", "review"]`.
2. **How many priority rows?** Default 3; 0 to 10. This is `"priorities_rows"`.
3. **Alarms as one line, or in full?** One line looks like `▲ 3 alarms: board stale · WIP · arc` (hover it for the
   rows); in full is one row per alarm. Default: automatic, which is one line in a short terminal and every row in a tall
   one. `"alarms"` is `"auto"`, `"count"` (one line) or `"full"`.
4. **Which fields on the last row, and in what order?** The choices are `asks` (unanswered asks), `open` (initiatives in
   progress), `today` (what ran unattended, and the day's spend), `tick` (the last tick) and `ceiling` (unattended spend
   against the daily budget). Default: asks, open, today, tick. This is `"foot"`, a list of those names in their order.
5. **A short title for the band?** Default `OVERLORD`; 1 to 40 characters, plain words (no markup). This is `"title"`.

Then write `agents/board-mod.json` in their repo from the answers: one key per question, even where the answer is the
default, so the file shows what can be changed. For the defaults it is exactly:

```json
{
  "title": "OVERLORD",
  "order": ["priorities", "roles", "alarms", "review"],
  "priorities_rows": 3,
  "alarms": "auto",
  "foot": ["asks", "open", "today", "tick"]
}
```

Check it parses (`jq empty "<repo>/agents/board-mod.json"` prints nothing when it is valid JSON), then tell them what it is:
the file is theirs to edit later, nothing has to be restarted (the mod reads it again every minute), and every key in it is
optional. The other keys (`full_rows`, `stale_minutes`, `show_subagents`, `board_file`) are left out on purpose;
`mods/overlord-board/README.md` lists every key with its default and meaning, and `agents/board-mod.json.example` has them
all. A key the mod cannot use is ignored on its own and the rest still apply, so a typo cannot blank the band.

## 9. Hand-off

Commit what changed in the repo (`git -C "<repo>" add -A` then `git -C "<repo>" commit -m "setup: done"`; skip if nothing changed). Then tell them:

- From now on they open **their repo folder**, not the `hatchery` folder, and type `/hatchery:overlord`.
  The first time, it asks about their home setup (router, NAS, UPS, smart-home hub and so on) and what
  the agents may read, manage, or never touch.
- If they answered the band questions: `agents/board-mod.json` is now in their repo and was committed with the rest. It is
  theirs to edit, every key is optional, and the keys are listed in `mods/overlord-board/README.md` (`agents/board-mod.json.example`
  shows them all with their defaults). It only matters once they load the mod, which stays off until they turn it on.
- What they did themselves today, and that it was theirs on purpose: the installs' admin prompt,
  reading the hooks, turning the plugin on, every restart.
- What to read next, only now: `WALKTHROUGH.md` (their first hour, what to do later, and § Turning it off to undo all of this).
