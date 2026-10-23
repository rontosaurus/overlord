# Start here

This is the one file you read before installing. Three steps, in order; stop after any of them.
Nothing is installed until step 3.

Hatchery takes you from asking an AI one-off questions toward a single persistent agent that knows
your setup and works as advisor, engineer and reviewer, with a coordinator that delegates, checks the
work it gets back, and writes down what went wrong. Why it is built this way is in
[`README.md`](README.md); you do not need it to install.

## 1. What you are agreeing to (about 5 minutes)

**Guard rails, not a vault door.** The kit adds *gates*: small bash scripts that refuse certain
commands (messaging anyone but you, secret-handling slips, irreversible commands in unattended
runs). They are pattern matches over command text. They catch mistakes; they do not stop a model
that is deliberately working around them. The plugin runs as you, with your permissions, so read
`kit/plugin/hooks/` and `kit/template/agents/ROUTING.md` before you turn anything on. Setup walks
you through the hooks in plain words and leaves the switch to you. What the two lists (never, and
the owner's hand) cover is in [`kit/README.md`](kit/README.md#gates-two-lists-and-one-merge-gate);
the technical limits are in its [Security](kit/README.md#security) section.

**Nothing runs unattended until you turn it on.** The daily loop starts in *propose* mode: it
writes down what it would do and does none of it until you change that setting. Sends to anyone and
deleting your data are never done by the agent. Other irreversible actions (reboot, firewall
change, key rotation) are staged: you approve or run each one.

**What leaves your machine.** Everything you type, and every file or command output the agent
reads, is sent to Anthropic to be processed. Whether it is used for training, and how long it is
kept, depends on your plan and on the data-control settings in your Claude account. Those rules
change, so read the current privacy pages and your own settings rather than trusting a summary
here. Claude Code also keeps full transcripts on your disk as plain text. Treat anything you paste
as retained somewhere, and never paste a secret.

**Keep it personal.** Use it on your own machine, with your own Claude account, for your own things.
Not on a machine someone else manages, and not with credentials or data that belong to someone else.
Setup asks you to confirm that.

## 2. Try it in a plain Claude chat first (no install)

Open a normal chat at claude.ai, or in the Claude app. Copy everything in the box below, paste it
in, and answer what it asks. It walks you through your privacy settings, then helps you start a
first small project.

```
I have a kit called "hatchery" that sets up a personal AI helper for my home. I have not installed
anything and I am not going to in this chat. I have read its START-HERE page.

Please do two things, one at a time, and wait for me after each:

1. Privacy check. Tell me where in my Claude account the data-control settings are (Model
   Improvement, memory, incognito chats) and ask me what I chose. Do not choose for me. Do not quote
   retention periods or training rules from memory - they change; tell me to check the current
   privacy page in my own account.

2. First project. Ask me about my home setup, one kind of thing at a time, with examples: my router or
   firewall, Wi-Fi, a NAS, a UPS, a smart-home hub, an always-on computer, a media server, backups
   (make and model if I know them), what is always on, and what annoys me. Write my answers up as ONE short notes page I can save.
   Then tell me how to make a Claude Project, put the notes page in it, and ask the same question
   once without the Project and once inside it, so I can see what the notes changed.

Ground rules: I am on my own computer and my own personal Claude account. No passwords, keys or Wi-Fi passphrases in this chat or in
the notes. Tell me when you are guessing.
```

## 3. When you are ready, let Claude set it up

You need Claude Code (the desktop app, signed in, or the terminal) on a paid plan or API key. Setup
installs `git` and `jq` if they are missing, each behind a prompt you approve. The first thing the
app asks is whether you trust this folder; that is a normal question, say yes.

Claude app → **Code** tab → **Local** session → open this folder → type: **set me up**

Claude follows `kit/SETUP.md`, asks before every step, and the choices that matter (installing,
signing in, turning the safety checks on) stay yours. If you stop, "continue setup" in a new session
picks up where you left off.

## After setup

Open [`kit/WALKTHROUGH.md`](kit/WALKTHROUGH.md): your first hour, what to do later, and how to turn
it all off. Everything else is reference, linked when needed and never required:
[`kit/README.md`](kit/README.md) (concepts and security notes),
[`kit/INTEGRATIONS.md`](kit/INTEGRATIONS.md) (what you can point it at),
[`kit/EXAMPLE-INCIDENT.md`](kit/EXAMPLE-INCIDENT.md) (what the work looks like).

Build it slowly, and grade it harshly.
