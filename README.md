# overlord

A Claude Code plugin and a template repo that package a small multi-agent framework: an **overlord**
that delegates and verifies, per-initiative **overseers**, read-only **specialist reviewers**,
**hook-enforced gates**, and a **drift log** that a periodic "overmind" session reads to review the
framework itself. It is for people who want Claude Code to do real operational work (infrastructure,
home or small-office systems, long-running projects) without being able to do anything they cannot
take back, and for people evaluating how that can be built.

The kit in this repo is called Hatchery. It was extracted from a framework I run on a
self-hosted homelab. Everything is plain files in a git repo: rules, prompts, routing tables, state.

## The problem

Point one agent at a long list of operational chores and three things go wrong, reliably.

1. **It does everything itself.** Planning, executing, reviewing and reporting happen in one context,
   so the thing that checks the work is the thing that did the work.
2. **Its reports are unverified.** "Done" is a sentence. Nothing makes the sentence true, and a
   confident summary reads the same whether the change worked or not.
3. **Cost and authority are unbounded.** The most expensive model gets used for everything, and
   nothing distinguishes "restart a pod" from "delete a volume" except the agent's own judgment in
   the moment.

The framework is a response to those three, built up from observed failures rather than designed
whole. Most of what follows exists because something in the log went wrong.

## The shape

**Roles.** The *overlord* is the session you talk to. It reads state, picks who should do a job,
checks what comes back, and writes down what it needs from you. It does not do the work. An
*overseer* owns one initiative from plan to report, on its own git branch (headless in my
deployment; the public kit has the overlord play this part interactively). *Workers* make
changes. *Scouts*, *researchers* and *verifiers* read, look things up and re-run checks.

**Specialists are read-only.** Security, on-call, stakeholder-impact, optimization and
design-review personas have no write tools. They return a verdict or a diagnosis and nothing else.
This is deliberate: a reviewer that can also fix the problem will fix it, and then the review is of
its own work. Keeping reviewers read-only keeps "who judged" and "who changed" separate by
construction, not by instruction.

**The coordinator verifies; it does not trust.** Every report ends with an attestation table: the
claim, one rerunnable read-only command that would prove it, and the expected result. The overlord
re-runs those commands (a cheap verifier persona does it) before treating a claim as true. A claim
with no check is labelled unverified. This catches the common failure of a report that says "done"
and is missing the output, and it catches reviewers too: a verdict that asserted an approval it had
not received was sent back because the overlord compared it to the recorded state rather than to how
sure it sounded.

**Hooks enforce; prompts advise.** Prompts get argued with. So actions are sorted onto two short
lists, with everything else fair game. The **never** list (sends to anyone, a secret in output,
deleting the owner's data, money) is refused in every mode. The **owner's-hand** list (the internet
path, storage layout, host power, git history) is refused outright in unattended runs and staged for
a human; in a session the owner is sitting in, the hook raises a permission prompt and the answer is
the go for exactly that command. Fair-game work carries three habits: look before you touch, record
the undo, log it. A model cannot talk its way past a regex. The hooks are guard rails, not a sandbox
(see limitations).

**Cost routing by model.** Reading is cheap, doing is mid-range, judging is expensive, designing is
top. A routing table says which role runs on which tier, and a role that has to exceed its row logs
why. In my deployment, dispatch carries per-run turn and budget caps and a monthly ceiling. Idle costs nothing between
ticks, and the scheduled loop has its own daily ceiling that it checks before doing anything.

**State is files.** Nothing lives in a running process's head. The overlord reads one state file on
waking and updates it on the way out. A session that dies loses nothing, and every decision can be
read, diffed and reverted with git.

**The framework reviews itself.** Every hook block, waived gate, mis-routed model, failed
attestation and secret-handling slip is appended to a drift log with a kind label. A periodic
*overmind* session, run interactively with the owner and never on its own, reads the log, the
scorecard generated from it and a sample of reports, asks "was routing right, were gates respected,
did the spirit hold", and changes the rules, prompts and personas accordingly. The log is data, not
prose, so reviews can count.

## What you can build on it

The pieces above are plumbing. What they make safe enough to try is the point, and each capability
traces to one or two of them:

- **Verified workers and attestations** let agents touch real systems, because a report is believed
  only after its read-only checks pass a second time.
- **Read-only reviewers and a security merge gate** let you expose things, because the reviewer
  cannot fix what it flags.
- **Hooks and the two lists** make unattended runs safe enough to schedule: a headless role is
  refused the irreversible shapes and stages them.
- **State in files and the governor loop** give long-running apps memory without a long-running
  process.
- **A cost ceiling and model routing** give those apps a spend bound the agent cannot edit.
- **The drift log and the overmind** let the system improve from its own failures.

[`kit/INTEGRATIONS.md`](kit/INTEGRATIONS.md) goes through what I have pointed it at, each item
marked as run, built, or merely possible:

- home automation, media libraries and their acquisition pipeline, a photo library and document vault;
- storage arrays, UPS and power-outage recovery, network segmentation, a self-hosted git forge;
- identity and SSO, remote access (LAN-only by default; anything reachable from outside sits behind the identity gate and
  the security review), personal finance from bank-data aggregation to a monthly brief;
- a tabletop-game DM that runs our campaign: it answers each player in character, speaks aloud at
  every client through a voice model on my GPU, runs NPC turns and real dice, and between sessions
  folds what happened into the campaign's canon, all while treating player text as untrusted input;
- a drafter for privacy-rights requests that never sends, owner-only phone notifications, and sensitive analysis on a local model on
  my own GPU (mail and documents today, finance designed), so raw content never reaches a cloud model.

**The app platform.** The part I find most useful is not any one integration but what
they add up to. My deployment has always-on primitives, each reachable through a scoped API: a
network with LAN DNS, a DNS and tunnel provider, a secrets manager, an always-on single-node k3s cluster, a NAS
for backups, an OIDC identity provider with passkeys, a self-hosted git forge, an owner-only phone
path, and a detection-and-remediation loop. With those in place, an idea I talk through with the
overlord becomes a brief with an availability tier, a design review, workers that write the
manifests, secrets, identity client, name, backup job and health alarm, a security review for
anything exposed, a verifier, and a loop that watches the result afterwards. I approve a
few named steps; the rest is fair game under the two lists. The page also says plainly where my
hand still is (the internet path, identity core, storage layout, irreversible deletes,
sends) and how each is shrunk to one tap. It walks through two real builds, a game-library app and
a file-drop page, with my taps listed.

It also covers three things in more depth: worked examples of privacy by construction (a hook that
keeps notifications off a device that is not yours, secrets that are never echoed); how exposure is
decided, with the security review as the only merge gate; and using the agents to investigate
incidents, including the debrief after each one: what happened, what was ruled out, which rule
was missing, and how the lesson becomes a test case before any prompt is changed.
It is a map of fits, not a product list, and the unattended parts still need you to turn them on.

## How it changed (the honest part)

- **Gates that were only ever waived were removed.** Early versions required a design review and
  several specialist sign-offs on most changes. The log showed the same gates waived over and over
  and a growing queue of items waiting on the human. A rule bypassed that routinely is mis-scoped,
  and rules nobody follows teach everyone to ignore the rest. The reform replaced the tiered
  approval scheme with two lists: a short **never** list, a short **owner's-hand** list (the
  internet-facing path, storage layout, anything that deletes durable data; staged, run only on a
  quoted human go), and everything else fair game with three habits attached: look at live state
  before touching, record the exact undo, log the action. Required specialist reviews dropped to
  two (security and on-call); the others became the overseer's call. The design-review gate was
  narrowed to rule changes, new services and new designs.
- **Hooks started loud and got narrower.** The first command-pattern gates blocked prose and
  heredocs that merely mentioned a dangerous word. Each false positive became a regression case and
  a narrower pattern. Where a block was kept on purpose despite being harmless, it is recorded as an
  accepted false positive so the count stays honest.
- **Attended and unattended modes differ.** The same irreversible-command rule *asks* a present
  human and *blocks* a headless run. Early on it blocked both, which meant phone prompts for
  read-only diagnosis; the gate keys on command shape, not on read versus write, and that
  imperfection is still on the review list.
- **The autonomy was staged.** The "governor" loop, a scheduled tick that triages state and may open
  work on its own, was built to start in *propose* mode: it writes what it would do and a human
  flips it to act. Its first tick was run by hand and its output read before it was scheduled.
- **Personas are held to a replay test.** A set of golden defects (a worker that cats a token file,
  a scout that aggregates wrongly, an optimizer missing a stale trigger) is replayed through the
  personas headlessly. A persona change is judged by whether it still catches them.

## What it missed

Drawn from the drift log of my deployment, generalized. Counts are rough and are lines
in a log, not incidents; one event can produce several.

| Category | Rough count | What it taught |
|---|---|---|
| Hook blocked or asked on a command | ~130 (about 80 blocks, 50 asks) | Most blocks of a *harmless* command were prose or heredoc text. A minority were real attempts at an irreversible action by an unattended role. |
| Reviews and reports flagged by the evaluator | ~25 | Reports whose claims did not survive a direct re-read; a scout (cheap tier) that listed a directory and reported a thing missing that was there. Cheap models need explicit search patterns. |
| Harness safety classifier denied a command | ~20 | The agent runtime has its own classifier above the hooks. Its denials were logged as a separate kind, because they show where the framework's briefs ask for things the platform will not grant. |
| Design-review gate waived | ~12 | Each had a stated reason. The rate was the signal that the gate was scoped too widely. |
| Model or budget discipline | ~7 (mis-routed tier, dispatch budget not matching the brief, a run killed at its cap) | A brief said one budget and the dispatch line carried another. Fix: read the brief's budget into the dispatch. |
| Routing bypass or coordinator doing worker work | ~8 | The coordinator ran an investigation by hand because no persona fit; structural gaps, not judgment, and they produced new personas or briefs. |
| Credential-handling slip (a value reached a local transcript or file) | 5 | The same class several times. Rules for credential-bearing files were added to every worker prompt and now exist as golden cases; the lesson was that a rule in one prompt is not a rule everywhere. |
| Data-safety bug that passed review | 2 | Reviews had *read* the artifact (dry run, grep) and nothing had *run* it. Rule added: at least one attestation must exercise the thing. |
| Reviewer rubber-stamping or asserting unearned status | a handful | The overlord compares verdicts to recorded state. |
| Context-window blowout | recurring, not counted | A hook now warns an attended session when its context is large or returns after a long idle, because a fresh session is cheaper. |
| Tooling defects in the framework's own verifier and merge scripts | several, from notes | The verifier ran relative commands from the wrong checkout and produced false failures; the merge script wrote a file and then refused on the dirty tree it had just made. Logged as notes to the overmind, which is what that channel is for. |

Two caveats worth stating. The framework catches mistakes of fact and of process much better than it
catches a persuasive wrong design. And the cheapest tier is only as good as its brief.

## Numbers, from my own deployment

Aggregates only, taken from the generated scorecard and state files at the time of extraction. It is
my own homelab, so these describe one real use, not a benchmark.

- **Gate regression suite (my deployment):** 142 cases for the shell guard hook, run in under a
  second and on every commit that touches the hooks. Of those, about 60 expect a block, about 18
  expect an ask, and 2 are recorded accepted false positives. Every real block and every false
  positive ever seen became one. **What ships in the kit:** `kit/plugin/hooks/cases.txt` has 100 cases
  (49 expect a block, 16 an ask, 35 an allow) plus 25 built-in tests in `check-gates.sh` (config
  safety, carry, drift, session ids, repo checks): 125 in total, `bash kit/plugin/hooks/check-gates.sh`
  ends with `125 passed, 0 failed`.
- **Persona replay:** 14 golden defects, each caught on its latest run; about 37 replays on record,
  including early runs that failed and drove prompt changes.
- **Drift log:** over 220 lines across about five weeks, 24 distinct kinds.
- **Dispatches:** around 70 costed overseer runs after the cost ledger began; the ledger lists runs,
  models, turns and dollars per initiative, and roughly a hundred saved reports.
- **Overmind reviews:** nine numbered reviews of the framework itself, each ending in concrete edits
  to prompts, personas, routing or hooks.
- **Test suites.** What ships: `test_board.py` and `test_usage.py` under `kit/template/agents/bin/`,
  and the `overlord-board` mod's own tests (`claude plugin test kit/mods/overlord-board`). My
  deployment also runs suites for state files, rotation, the strategist and the evaluator;
  those are not in the kit.

## Install and quick start

Requirements: Claude Code, `bash`, `jq`, git, and a paid Claude plan or API key; `python3` for the
board and the governor loop. Cost orders of
magnitude: a cheap-model read is cents, a mid-model initiative is low single dollars, a top-model
design review is a few to ten-plus dollars.

1. Read `kit/README.md` first. It explains every term, the two lists and the security
   notes. Then read every file in `kit/plugin/` before enabling anything; the plugin's hooks run
   with your permissions.
2. Open this repo's folder in Claude Code and say "set me up". `kit/SETUP.md` is the guided first
   session. It lists the plugin as off, merges three settings lines next to yours (never over
   them), and leaves the switch to you.
3. `kit/WALKTHROUGH.md` is the first hour, and how to turn it all off.
4. `kit/EXAMPLE-INCIDENT.md` is a reconstructed multi-day outage, with invented names, showing what
   routing, a specialist diagnosis and a corrected reviewer verdict look like.

Invoke with `/hatchery:overlord` and `/hatchery:overmind`.

## Layout

| Path | Contents |
|---|---|
| `kit/README.md` | Concepts, roles, gates, security notes. Start here. |
| `kit/SETUP.md` | Guided first session. |
| `kit/WALKTHROUGH.md` | First hour; how to disable. |
| `kit/EXAMPLE-INCIDENT.md` | A worked, reconstructed incident. |
| `kit/INTEGRATIONS.md` | What you can build on it: integrations, privacy examples, the app platform (idea to running service), external access, investigating with agents. |
| `kit/plugin/` | The Claude Code plugin: two skills (overlord, overmind), nine subagent personas, hook scripts. |
| `kit/template/` | The repo skeleton you copy: rules file, one-page roadmap, routing table, state files, the governor loop (`tick`, `strategist`), the local board, session rotation and usage tools. |
| `kit/dropin/` | The settings lines the setup session adds. |
| `kit/mods/` | Optional Claude Code mods, off by default: `overlord-board` draws the board above the prompt. |

## Status and limitations

- **Single maintainer.** I built this and use it. It is shared as a worked example and a
  usable kit, not a supported product.
- **Claude Code only.** It depends on Claude Code's plugin, skill, subagent and hook mechanisms.
  Cloud sessions in the browser do not load local plugins.
- **Platforms.** Hooks are tested on Linux. macOS is untested. On Windows, Git for Windows (for
  Git Bash) and `jq` are required, otherwise the hook scripts do not run and every gate is silently
  off; the setup session checks this. Treat Windows as unverified.
- **Gates are pattern matches over command text.** They catch mistakes, not a model actively working
  around them. The irreversible-command list is common shapes, not exhaustive. The unattended-run
  gate binds only when a role variable is set; in your own sessions the owner's-hand shapes ask instead of blocking, and the never-paths block everywhere.
- **The unattended parts ship switched off.** The governor loop needs an always-on machine, a
  scheduler you set up, and a `tick_mode` you flip from `propose` to `act`. Headless dispatch of
  overseers onto their own branches exists in my
  deployment and is not in the kit: here the overlord plays the overseer role in your session.
- **The numbers above are one deployment's.** No claim is made about how it performs elsewhere.

## License

MIT. See `LICENSE`.
