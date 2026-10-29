# overlord

A Claude Code plugin and a template repo that package a small multi-agent framework: an **overlord**
that delegates and verifies, per-initiative **overseers**, read-only **specialist reviewers**,
**hook-enforced gates**, and a **drift log** that a periodic "overmind" session reads to review the
framework itself. It is for people who want Claude Code to do real operational work (infrastructure,
home or small-office systems, long-running projects) without being able to do anything they cannot
take back, and for people evaluating how that can be built.

The kit in this repo is called Hatchery. It was extracted from a framework I run on a
self-hosted homelab. Everything is plain files in a git repo: rules, prompts, routing tables, state.

**To install it, open [`START-HERE.md`](START-HERE.md).** It is the only install document: what you
are agreeing to, a no-install try in a plain chat, then "set me up". The rest of this page is why it
is built the way it is.

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
whole. Most of what follows exists because something in the log went wrong. The terms (overlord,
overseer, the two lists, H1 to H7) are defined once, in [`kit/README.md`](kit/README.md).

## The shape

**Separate who judges from who changes.** The overlord is the session you talk to; it reads state,
picks who should do a job, checks what comes back, and does not do the work. Specialist reviewers
(security, on-call, stakeholder-impact, optimization, design-review) have no write tools and return
a verdict or a diagnosis, nothing else. A reviewer that can also fix the problem will fix it, and
then the review is of its own work; read-only keeps the two apart by construction, not by instruction.

**The coordinator verifies; it does not trust.** Every report ends with an attestation table: the
claim, one rerunnable read-only command that would prove it, and the expected result. The overlord
re-runs those commands (a cheap verifier persona does it) before treating a claim as true. A claim
with no check is labelled unverified. This catches the report that says "done" and is missing the
output, and it catches reviewers too: a verdict that asserted an approval it had not received was
sent back because the overlord compared it to the recorded state rather than to how sure it sounded.

**Hooks enforce; prompts advise.** Prompts get argued with, so actions are sorted onto two short
lists with everything else fair game: a **never** list refused in every mode (sends to anyone, a
secret in output, deleting the owner's data, money) and an **owner's-hand** list (the internet path,
storage layout, host power, git history) that is refused outright in unattended runs and staged for a
human, or, in a session the owner is sitting in, raises a permission prompt whose answer is the go
for exactly that command. Fair-game work carries three habits: look before you touch, record the
undo, log it. A model cannot talk its way past a regex. The hooks are guard rails, not a sandbox;
the lists are in [`kit/README.md`](kit/README.md#gates-two-lists-and-one-merge-gate) and the
limits in [START-HERE](START-HERE.md) and the kit's [Security](kit/README.md#security) section.

**Cost routing by model.** Reading is cheap, doing is mid-range, judging is expensive, designing is
top, and a role that has to exceed its row logs why. Dispatch carries per-run turn and budget caps and
a monthly ceiling in my deployment; the scheduled loop has its own daily ceiling that it checks before
doing anything, and idle costs nothing between ticks.

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

The pieces above are plumbing. What they make safe enough to try is the point: verified workers let
agents touch real systems, read-only reviewers let you expose things, hooks and the two lists make
unattended runs safe enough to schedule, state in files gives long-running apps memory without a
long-running process, and a cost ceiling the agent cannot edit bounds the spend.
[`kit/INTEGRATIONS.md`](kit/INTEGRATIONS.md) goes through what I have pointed it at, each item
marked as run, built, or merely possible: home automation, media libraries and their acquisition
pipeline, a photo library and document vault, storage and power-outage recovery, network
segmentation, a self-hosted git forge, identity and remote access (LAN-only by default; anything
reachable from outside sits behind the identity gate and the security review), personal finance, a
tabletop-game DM that runs our campaign (in character, voiced on my GPU, treating player text as
untrusted input), a drafter for privacy-rights requests that never sends, owner-only phone
notifications, and sensitive analysis on a local model so raw mail and documents never reach a cloud
model. It is a map of fits, not a product list, and which of them apply to you is whatever your own
`roadmap/home-setup.md` says you have.

**The app platform.** The part I find most useful is what the integrations add up to. With always-on
primitives in place (LAN DNS, a secrets manager, a small cluster, a NAS, an identity provider, a git
forge, an owner-only phone path, a detection loop), an idea I talk through with the overlord becomes a
brief with an availability tier, a design review, workers that write the pieces, a security review for
anything exposed, a verifier, and a loop that watches the result afterwards. I approve a few named
steps; the rest is fair game under the two lists. `kit/INTEGRATIONS.md` walks through two real builds
with my taps listed. You do not need any of those primitives to start.

## How it changed (the honest part)

- **Gates that were only ever waived were removed.** Early versions required a design review and
  several specialist sign-offs on most changes. The log showed the same gates waived over and over
  and a growing queue of items waiting on the human. A rule bypassed that routinely is mis-scoped,
  and rules nobody follows teach everyone to ignore the rest. The reform replaced the tiered
  approval scheme with the two lists above, with three habits on everything else. Required specialist
  reviews dropped to two (security and on-call); the design-review gate was narrowed to rule changes,
  new services and new designs.
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
- **Debriefs became part of closing a session.** Every attended role session now ends by answering five
  short questions: what it spent its turns on, what got in its way, where it guessed, which rule was
  unclear, and what its successor needs. Nobody grades the answers. The overmind reads them at each
  review, and two debriefs that name the same friction become an edit to the framework. Several of the
  fixes in this release trace to them, alongside the drift log and the notes.
- **A refusal is a stop, read-only included.** A worker that was refused a read-only command once
  got the same result another way, through a wrapper script. That taught the rule as it now reads in the
  worker prompt: a refusal from the harness, a hook or the classifier is a stop whatever the command.
  Report the reason verbatim, log it as a `classifier-deny`, and never reach the same effect through a
  script or another tool.
- **My deployment runs things that are not in this kit yet.** There are three: a role guard that boxes a
  read-only coordinator session into an exact allowlist of commands, argument by argument; a strategist
  process that is the single writer of status, so no other role edits it; and persistent coordinator and
  strategist seats that stay open for a day instead of starting per task. I held them back on purpose.
  The first live probes showed the guard too tight (the coordinator could not even reply to the session
  of the human it was working for), and I ship a design here only after it has run live for a while. Until
  then the overlord in your session does that work itself.


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

- **Gate regression suite (my deployment):** 245 cases for the shell guard hook, run in under a
  second and on every commit that touches the hooks. 123 expect a block, 41 an ask, and 6 are
  recorded accepted false positives. Every real block and every false positive ever seen became
  one. **What ships in the kit:** `kit/plugin/hooks/cases.txt` has 309 cases (166 expect a block, 58 an
  ask, 85 an allow; 4 pinned false positives) plus 29 built-in tests in `check-gates.sh`: 338 in total,
  and `bash kit/plugin/hooks/check-gates.sh` ends with `338 passed, 0 failed`. About 130 of those
  cases were added in this release, and some 70 of them fail against the previous kit guard: the
  quoted-grep false positive, line continuations, recursive deletes with the flags after the path,
  rsync and find variants, host-power verbs with redirects, and four heredoc shapes that hid a command.
  A security read of the release found one more hole in the fix itself (an apostrophe inside a
  double-quoted string could hide a reboot from the new pattern blanking) and it is pinned as a case.
- **Persona replay:** 29 golden defects, each caught on its latest run; over a hundred replays on
  record, including early runs that failed and drove prompt changes.
- **Drift log:** about 380 lines across six weeks, 37 distinct kinds.
- **Dispatches:** about a hundred costed overseer runs after the cost ledger began, and about 140
  saved reports.
- **Overmind reviews:** thirteen numbered reviews of the framework itself, each ending in concrete
  edits to prompts, personas, routing or hooks.
- **Test suites that ship:** `test_board.py` and `test_usage.py` under `kit/template/agents/bin/`, and
  the `overlord-board` mod's own tests (`claude plugin test kit/mods/overlord-board`). My deployment
  also runs suites for state files, rotation, the strategist and the evaluator; those are not in the kit.

## Install

Open [`START-HERE.md`](START-HERE.md). Requirements: Claude Code on a paid Claude plan or an API key,
`bash`, `jq` and `git` (setup installs the last two on Windows), and `python3` for the board and the
governor loop. Invoke with `/hatchery:overlord` and `/hatchery:overmind`. What is in each folder is
listed in [`kit/README.md`](kit/README.md#whats-in-the-box).

## Status and limitations

- **Single maintainer.** I built this and use it. It is shared as a worked example and a
  usable kit, not a supported product.
- **Claude Code only.** It depends on Claude Code's plugin, skill, subagent and hook mechanisms.
  Cloud sessions in the browser do not load local plugins.
- **Platforms.** Hooks are tested on Linux; macOS is untested; Windows is unverified and needs Git
  for Windows and `jq`, otherwise every gate is silently off (setup checks this; details in
  [`kit/README.md`](kit/README.md#security)).
- **Gates are pattern matches over command text.** They catch mistakes, not a model actively working
  around them, and the irreversible-command list is common shapes, not exhaustive.
- **The unattended parts ship switched off.** The governor loop needs an always-on machine, a
  scheduler you set up, and a `tick_mode` you flip from `propose` to `act`. Headless dispatch of
  overseers onto their own branches exists in my deployment and is not in the kit: here the overlord
  plays the overseer role in your session.
- **The numbers above are one deployment's.** No claim is made about how it performs elsewhere.

## License

MIT. See `LICENSE`.
