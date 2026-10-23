# Setup — the guided first session

**For Claude.** The owner opened a Claude Code session in the unpacked `hatchery` folder (it holds
`START-HERE.md`, `LETTER.md` and `kit/`) and asked to set it up. **Every path below is inside `kit/`**
(`plugin/` is `kit/plugin/`), and "the kit" means that `kit/` folder. Walk them through the steps below, one
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

1. If `LETTER.md` exists in the `hatchery` folder (one level up from this file), ask whether they have done the privacy check
   (`START-HERE.md` step 2). If not: point them to that step and stop here. The kit
   waits for that.
2. Say in one line that this setup is for their home: personal account and machine only.
3. Tell them the plan in five lines: install two tools → make their own repo folder → a short
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

Ask, one at a time, and write only what they say:

1. **What should I call you?** → replaces `<your-name>` in `<repo>/CLAUDE.md` (and in
   `agents/ROUTING.md` / `roadmap/ROADMAP.md` where it appears).
2. **Who must never get a message from an agent by accident?** A person, a family group chat, a
   shared channel. Explain: the H1 gate refuses any command that names them. Help them pick names
   that appear only in a send (a device name, a channel or chat name, an address) — a bare first
   name also blocks reading files that mention the person. → `agents/guard.conf`, copied from
   `guard.conf.example`, `H1_PATTERNS='name1|name2'`. At least one entry; an empty one turns H1 off.
3. **Is there a service whose API changes things you cannot undo** (a DNS provider, a domain
   registrar)? → `H4_PROVIDER_HOSTS` in the same file, or leave the example value.
4. **Do you use a password manager with a command-line tool?** → `SECRET_CLI=` in
   `agents/estate.env`, copied from `estate.env.example`; empty is fine.
5. **Anything the agent must never touch?** → one line under "Rules that do not bend" or "Local
   facts" in `CLAUDE.md`, their words.

Everything else about their home is for the first overlord session, which starts with the home-setup interview (`roadmap/home-setup.md`: what they have, from a list of examples, and what the agents may do with each). Do not ask it here. Show them the three files when done.

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
settings file yourself, for the same reason. Explain the three lines:

- `extraKnownMarketplaces.hatchery` — tells Claude Code where this kit's plugin lives (the `kit/` folder).
  It only makes the plugin *available*.
- `enabledPlugins."hatchery@hatchery": false` — listed, and **off**. Turning it on is step 6, theirs.
  If they already have it listed, the script keeps their value.
- `env.AGENTS_REPO` — the path of their repo, so the hooks know where their rules live. If they
  already have an `AGENTS_REPO`, the script keeps theirs and says so.

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
     Say so plainly, carry on, and and consider filing an issue on the repo.
   - Runs there too: the gates are off on this machine — stop and say so. The most likely causes
     are no Git Bash, no jq, or the plugin not enabled.

## 8. Board (optional)

If `python3 --version` (Windows: `python` or `py`) works: `cd "<repo>" && python3 agents/bin/board`, then
open `agents/state/board/index.html` in their browser. It is a read-only local page drawn from the state
files; nothing is served. The `overlord-board` mod in `mods/` draws the same view above the prompt — it is
off by default; show them `mods/README.md` and let them decide. No Python is fine; skip this step.

## 9. Hand-off

Commit what changed in the repo (`git -C "<repo>" add -A` then `git -C "<repo>" commit -m "setup: done"`; skip if nothing changed). Then tell them:

- From now on they open **their repo folder**, not the `hatchery` folder, and type `/hatchery:overlord`.
  The first time, it asks about their home setup (router, NAS, UPS, smart-home hub and so on) and what
  the agents may read, manage, or never touch.
- What they did themselves today, and that it was theirs on purpose: the installs' admin prompt,
  reading the hooks, turning the plugin on, every restart.
- How to undo it: `WALKTHROUGH.md` § Turning it off.
