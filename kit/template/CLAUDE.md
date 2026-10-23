# Working in this repo

This repo is the **system of record** for <your-name>'s personal infrastructure: what runs where,
what is planned, and the configuration and documentation that plan produces. It is not a codebase —
it is a plan plus the things the plan produces.

## Read this before acting

**[`roadmap/ROADMAP.md`](roadmap/ROADMAP.md) is the spine.** Read it (your copy lives at
`<your-roadmap-path>`), then read the one spec you are executing. Specs carry their own context; you
do not need the original conversation. Each spec's `Status:` line and Log say exactly where the last
session stopped.

## Rules that do not bend

1. **The decision log is LOCKED.** Do not reopen a locked decision because it seems suboptimal. Only
   <your-name> amends it. If a step cannot proceed as written, log the blocker in the spec's Log, do
   the safe subset, and stop.
2. **Update the spec you touched.** Every session amends that spec's `Status:` line and adds a dated
   Log entry (YYYY-MM-DD) saying what changed.
3. **No secrets in the repo, ever.** Not in files, not in commit messages, not in transcripts. Notes
   hold pointers to where a secret lives, never the value.
4. **Never send anything to anyone but <your-name>** — message, email, invite, shared document,
   phone push — without explicit permission for that specific message. A send cannot be taken back.
5. **Every new service or automation gets an availability tier at design time** (how badly does
   it matter if it is down, and who notices). Write the tier into its spec.
6. **Git is Claude-managed by default.** Sessions end with a commit. Edit this if you prefer to run git yourself.

## The agent framework

[`agents/ROUTING.md`](agents/ROUTING.md) is the one page every role reads: roles, gates, the two
lists, the verification protocol. [`agents/README.md`](agents/README.md) explains the layout and
how to use it. Open a session and run `/hatchery:overlord` (or `/overlord`) to start.

## Local facts

Fill these in; the framework reads them to judge impact.

- **What runs where:** <host or device> — <what it does>
- **Who depends on it:** <names of the people who depend on this infrastructure> — <what they use>
- **Quiet hours / do-not-disturb windows:** <HH:MM–HH:MM> — nothing noisy or restarting then
- **Always-on vs sometimes-on:** <which machines may be off; nothing unattended depends on those>
- **Where secrets live:** <your secret manager or password vault> (pointers only)
