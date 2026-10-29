# Security

## Trust model

The kit's gates are guard rails, not a sandbox: they are pattern matches over command text that
catch mistakes and drift, not a model that is deliberately working around them. Everything in the
kit (the hooks, the skills, the scheduled tick and the optional mod) runs as you, with your
permissions. Read `plugin/hooks/` (and `mods/overlord-board/hooks/register.tsx`, if you load the mod)
before you turn anything on; setup lists the plugin as off and leaves the switch to you. Apart from
what Claude Code itself sends to Anthropic to run your session (`START-HERE.md` step 1), nothing in
the kit sends anything off your machine unless you set a notify command yourself
(`HATCHERY_NOTIFY_CMD`, in the timer unit or cron line) or turn on `tick_push`. Secrets are never meant
to appear in output: fetch them inside a command into a variable, and never print, redirect or
commit a value.

## Reporting a problem

Open an issue on the GitHub repository. Include the exact command text or file and line, what you
expected the kit to do, and what it did. For a gate problem, the most useful report is the case that
would pin it, in the format of `plugin/hooks/cases.txt` (`### <role> <expected>` followed by the
command), and the output of `bash plugin/hooks/check-gates.sh --live "<command>"`.

If the finding would help someone attack an installed kit before it is fixed, do not put the details
in a public issue. Use the repository's private vulnerability report (the **Security** tab, "Report a
vulnerability") if it is offered; otherwise open an issue that only asks for a private channel, and the
maintainer (GitHub account `rontosaurus`) will reply there. This is a one-person project: reports are
read and answered on a best-effort basis, with no response-time promise.

Never include a real secret, token or private key in a report, public or private.

## In scope

- **The hooks** (`plugin/hooks/`): a command shape on the never list or the owner's-hand list that an
  honest mistake or a drifting model could plausibly produce and that the guard allows; a way for
  the agent to write its own control files (`ceiling.json`, `guard.conf`, `estate.env`,
  `agents/bin/`, `agents/prompts/`, `agents/senses.d/`, the settings, the hooks) that neither the deny
  rules nor H7 catch; a configuration file being executed rather than parsed; a hook following a
  symlink out of your repo; a false positive that blocks routine work (an ordinary issue is fine).
- **The skills and personas** (`plugin/skills/`, `plugin/agents/`): an instruction that routes a
  never-list or owner's-hand action around the gates, or that puts a secret value into output.
- **The settings drop-in** (`dropin/`): anything that overwrites or prints a value you already had,
  or turns the plugin on.
- **The template's tools** (`template/agents/bin/`, `template/agents/prompts/`): a way for a file an
  agent can edit to choose what the unattended tick runs or whom it notifies; a way past the daily
  ceiling; a script that writes outside your repo.
- **The mod** (`mods/overlord-board/`): reading or running anything outside `AGENTS_REPO`, or
  mishandling a hostile `board.json`.

## Out of scope

- Claude Code itself, its permission system and its auto-mode classifier: report those to Anthropic.
- A bypass that only a deliberately adversarial or prompt-injected model would build. The hooks are
  judged against honest mistakes and drift (the security persona holds the same line); such a
  finding is welcome as a note, not treated as a vulnerability.
- Your own `guard.conf` patterns, and the services and integrations described in `INTEGRATIONS.md`,
  which are not shipped in the kit.

## Known limits

These are documented, not bugs:

- The owner's-hand list is common command shapes, not every shape: other verbs or flags for the same
  action, compound commands whose first part is a pod delete, and `find -delete` outside the never
  paths are missed.
- The shell side of H7 misses writes made by `git checkout`/`restore`/`apply`/`am`, `curl -o`,
  `wget -O`, `tar -x`/`unzip`, a path held in a variable, a `cd` first, and anything written from
  inside an interpreter. Make the control files read-only to the agent's user for real protection.
- The hooks fail open on their own errors, and the gates are off without `jq`, without
  `agents/estate.env`, or on Windows without Git Bash. Setup step 7 proves they run.
- Hooks are tested on Linux; macOS is untested and Windows is unverified. The session registry needs
  `/proc`.
- Cloud sessions in the browser do not load local plugins, so no gate applies there.

The technical details are in [`README.md` § Security](README.md#security), and the project's wider
limits in the top-level README's
[Status and limitations](../README.md#status-and-limitations) (in the published repository).
