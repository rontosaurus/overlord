To whoever unpacked this —

This kit takes you from asking an AI one-off questions toward a single persistent agent that knows
your setup and works as advisor, engineer and reviewer, with a coordinator that delegates, checks the
work it gets back, and writes down what went wrong. Each step unlocks the next, and you can stop at
any of them.

## Trust model: read this first

- The kit adds **gates**: small bash scripts that refuse certain commands (messaging anyone but you,
  secret-handling slips, irreversible commands in unattended runs). They are pattern matches over
  command text. They catch mistakes; they do not stop a model that is deliberately working around
  them. Treat them as guard rails, not a vault door.
- **Read `kit/plugin/hooks/` and `kit/template/agents/ROUTING.md` before you install anything.** The
  plugin runs as you, with your permissions.
- Nothing runs unattended until you turn it on. The daily loop starts in **propose** mode: it writes
  down what it would do and does none of it until you change that setting.
- **Sends to anyone and deleting your data are never done by the agent.** Other irreversible actions
  (reboot, firewall change, key rotation) are staged: you approve or run each one.

## Keep it personal

Use it on your own machine, with your own Claude account, for your own things. Do not use it on a
machine someone else manages, or with credentials or data that belong to someone else. Setup asks you
to confirm that.

## What leaves your machine

Everything you type, and every file or command output the agent reads, is sent to Anthropic to be
processed. Whether it is used for training, and how long it is kept, depends on your plan and on the
data-control settings in your Claude account. Those rules change, so read the current privacy pages
and your own settings rather than trusting a summary here. Claude Code also keeps full transcripts on
your disk as plain text. Treat anything you paste as retained somewhere, and never paste a secret.

## How to start

`START-HERE.md` has three steps: read this, try one prompt in a plain chat with nothing installed, then
open this folder in the Claude desktop app's **Code** tab and say **set me up**. Claude follows
`kit/SETUP.md` and asks before every step; installing, signing in and turning the gates on stay yours.

Build it slowly, and grade it harshly.
