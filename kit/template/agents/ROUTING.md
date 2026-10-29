# Agent framework — routing, gates, the two lists (operational tables)

*The one page every role reads. If this file and any other description disagree, this file is what
runs and the other gets corrected. Items marked **v2** are designed but not shipped in v1; in v1 you
do them by hand or by reading.*

## 1. Roles and models

Principles: **reading cheap · doing mid · judging expensive · designing the top model.** The Model
column is the one place to edit; use whatever model names your plan offers for each tier.

| Role | Runs as | Model | Tools | Writes |
|---|---|---|---|---|
| **overmind** | interactive session **with <your-name>**, `/hatchery:overmind` | top | all | `agents/**` |
| **overlord** | interactive session, `/hatchery:overlord` (v2: heartbeat timer) | expensive | read-only + **verification commands** + `agents/bin/*` | `agents/state/overlord.md`, notes, drift, merges |
| **overseer** (v2) | headless `claude -p` via `agents/bin/dispatch`, one per initiative | mid (expensive when the brief says `design`) | all, on branch `init/<id>` | the spec it executes, its report |
| **worker** | subagent of an overseer, or of the attended overlord to execute a change (fair game on its own under the habits; an owner's-hand action only on a quoted go, §3) | mid | all except Agent | working tree |
| **scout** | subagent | cheap | read-only | nothing |
| **verifier** | subagent (overlord or overseer) | cheap | read-only Bash | nothing |
| **security** | subagent, specialist | expensive | read-only | nothing (returns a review) — required for the cases in §2 |
| **on-call** | subagent, specialist | mid | read-only + diagnostics | nothing (returns a diagnosis) — first on any incident |
| **stakeholder-impact** | subagent, specialist | mid | read-only | nothing (returns a review) — a second read; its checklist is a habit |
| **optimization** | subagent, specialist | mid | read-only | nothing (returns a review) — a second read on a new image or a mover; its checklist is the overseer's |
| **design-review** | subagent, the F-gate reviewer | top | read-only | nothing (returns a verdict) |
| **researcher** | subagent, specialist | mid | read-only + WebSearch/WebFetch | nothing (returns a fact table: claim · URL · verbatim quote · status) |

The *ratio* between tiers matters more than the names, so edit a `model:` line in a persona file if a name is not on your plan. The top-model `design-review` is the costliest single call, and on day one the F gate can be *you reading* instead of a subagent. As orders of magnitude, cheap-model reads cost cents, a mid-model initiative costs low single dollars, a top-model design brief costs $5–15, and `--max-budget-usd` may not bind on subscription usage, so turns do.

A role never calls a model above its row without logging a drift line (`agents/bin/drift`).

## 2. Gates — two lists, one merge gate

Everything not on a list is **fair game** for any role, attended or unattended, under three habits. The lists
are the owner's; the overmind proposes changes, the owner edits them. Security is the one review that is a merge
gate; everything else is a habit the overseer applies itself.

The rows below are written for a homelab. **Keep the ones that match what `roadmap/home-setup.md` says
you have, delete the rest, add yours**; the Kubernetes and media-library items apply only if you run
them. The access words in `home-setup.md` can only make a thing stricter than these lists: `ask` is
owner's hand, `never` is never, and `read` means look only.

| List | Contents (edit to fit your setup) | Mechanism |
|---|---|---|
| **Never** — no mode bends it, not even a tap; the owner does these | sends to anyone (CLAUDE.md rule 4); a secret value in output, a file or a transcript; anything unattended that depends on a machine that is not always on; editing the decision log (the framework drafts an amendment, class F); money (purchases, subscriptions, plan changes); deleting the owner's own data (photos, documents, finance, anything marked keep) | H1 (sends); H2 (secrets); persona `tools:` lines; the harness classifier |
| **Owner's hand** — the agent stages the exact command; the owner's explicit go runs it; unattended runs stage and stop | **the internet path:** gateway/WAN/firewall, DNS zones, the tunnel, TLS, the identity provider, the system namespaces · **core config of anything people rely on** (e.g. a smart-home hub's core config) · **storage:** arrays, pools, share layout; if you run Kubernetes, `pvc`/`pv`/namespace/storageclass/Secret deletes · **host power** · any `rm` or `find -delete` on a media or backup mount (staging into a staging folder, e.g. `_to_delete/`, is fair game; the delete is the owner's) · any mutation by a selector or `--all` · git history (force push, reset or delete `main`) · `helm uninstall` (if you use it) · anything `home-setup.md` marks `ask` | H4 shapes in the bash guard; the staged-deletion pattern |
| **Fair game** — everything else | restarts, rollouts, scaling (to zero too), applies of a reviewed manifest, (if you run Kubernetes) **named** pod/Job/Deployment/CronJob/ConfigMap deletes outside the system namespaces, service API writes, anything `home-setup.md` marks `manage`, repo edits on a branch, docs, staged moves, package installs in a venv, timers and scheduled jobs that carry a tier | the three habits: **look before you touch**, **record the undo**, **log it** (`agents/bin/act`) |

**Hooks — hook-enforced, mechanical, everywhere.** Enforced by the plugin's hooks on every session
once configured (`SETUP.md` step 6), interactive or headless. These are pattern matches over
command text, not judgment, so a model cannot talk its way past one; but they are guard rails, not
a vault door. Targets and hosts are configured in `guard.conf` (copy `agents/guard.conf.example`).

| # | Rule | Where |
|---|---|---|
| H1 | Never message the targets in `guard.conf` (`H1_PATTERNS`) — the people or shared channels that must never receive an automated send (CLAUDE.md rule 4) | bash guard hook |
| H2 | **Optional** — only if a secret-manager CLI is configured in `estate.env` (`SECRET_CLI`): blocks a bare listing command without `jq` (would print every value) and redirecting or piping a fetched value into `cat`/`tee`/`echo`; printing a value to the terminal or via a variable echo is **not** blocked, so fetch one named secret in-process only | bash guard hook |
| H3 | Secret-shaped string in a commit — **NOT shipped in v1 (v2)** | git pre-commit hook |
| H4 | **Owner's-hand shapes** (§2 list): in **unattended runs** (`AGENT_ROLE` set) the hook refuses them (stage, never retry); in **attended sessions** it returns a permission prompt and the owner's answer is the go for exactly that command. Also covers git history (force push, history rewrite, delete or reset of `main`), calls to the hosts in `H4_PROVIDER_HOSTS`, and your own shapes in `H4_ASK_PATTERNS`; every ask is logged as a `hook-ask:H4` drift line. Paths in `H4_NEVER_PATHS` (your data roots) are refused for `rm -r` / `find -delete` in every mode. Branch discipline (`git push`, merging or switching to `main`) binds unattended runs only. The list is not exhaustive: it misses, for example, other verbs or flags for the same action, compound commands whose first part is a pod delete, and `find -delete` outside the never-paths. Power words (`reboot`, `shutdown`, `poweroff`, `halt`) match only in **command position** (or after `ssh`, or as a `systemctl` verb), so file names and prose mentioning them pass; `rm` and `git` matches stop at the next `;` `&` `|`, and `git -C <dir>` is seen through | bash guard hook |
| H5 | Every session registers itself; a session start prints the other live sessions | session-start hook |
| H6 | Attended sessions get a **context-size notice** (never a block) when the context is large or resumes after a long idle; thresholds in `context-watch.conf`. At the notice, **rotate**: `agents/prompts/rotation.md` writes a carry to `agents/state/carry/<role>.md` (`agents/bin/carry` checks it, `agents/bin/rotate` records the successor) and the next session's start prints it | UserPromptSubmit hook |
| H7 | Permission **deny** rules in the owner's user settings: Edit/Write of the settings file and of the plugin's `hooks/` folder, plus any send-capable connector tool you list, plus the agent's control files (`agents/state/ceiling.json`, `guard.conf`, `estate.env`, `bin/`, `senses.d/`, `prompts/`, `.claude/`). A deny holds in every permission mode; the bash hook refuses shell writes (`>`, `sed -i`, `cp`, `mv`, `tee`, `chmod`, `crontab`) to the same paths plus `agents/state/costs.tsv`, `~/.claude.json` and `~/.config/systemd/`. The shell side is a pattern match, not a sandbox: it misses `git checkout/restore/apply/am`, `curl -o`, `wget -O`, `tar -x`/`unzip`, a path in a variable, a `cd` first and interpreters - make those files read-only to the agent's user | `dropin/merge-settings.sh` |

**Reviews — the overseer's call, with defaults.** Only *security* is a merge gate; the overseer's report names
which reviews it ran and, in one line each, why not the others.

| Trigger | Review | Standing |
|---|---|---|
| ingress, reverse proxy, tunnels, identity provider, TLS, network policy, firewall, a new internet-reachable surface, anything that reads or moves a token | **security** | **required** |
| any incident, alert, "X is down", "is X working?" | **on-call** first, before anyone restarts anything | **required** |
| a change the people who depend on this infrastructure would notice (media, home automation, shared services, DNS, or inside the quiet hours in `home-setup.md`) | the **stakeholder-impact habit**: check who is using it before restarting; prefer the quiet window for anything noticeable; no path that could reach anyone's device but the owner's. Run the persona for a second read on who is affected | habit |
| a new or rewritten manifest, scheduled job, timer, image or data-moving script | the **optimization checklist** (placement, resources, scheduling, hygiene, cleanup, image entrypoint, never-move-without-a-file) applied by the overseer; the persona for a second read on a new image or a mover | habit |

**Class F — top-model design review.** The overseer stops and the overlord dispatches `design-review` (or holds
for the owner). Skipping one is allowed **only** with a drift line naming who waived it and why.

| Trigger |
|---|
| Drafting a decision-log amendment (only the owner amends; the reviewer drafts the proposal) |
| A new service or automation (the availability-tier assignment happens here) or a new spec |
| Changing a persona, a model row, a gate (hook or list), a budget, or a *rule* in a prompt (`agents/**`) — overmind territory, with the owner. Tooling under `agents/bin/` and wording fixes go through a normal initiative |

No longer F: revising a spec beyond its Status line and Log, backup or storage design (security review plus the
owner's-hand list), "anything that would send to a person" (the never list: the owner's permission for that
message, not a review).

## 3. What may run, and on whose word

| | Who may, when | What it leaves behind |
|---|---|---|
| **Fair game** | anyone, attended or unattended, no ask | an `act` line (what, undo, proof); the look-before-touch read and the undo quoted in the report |
| **Owner's hand** | attended: staged, then the owner's explicit go (a quoted `GO` block in the brief, or a permission prompt); unattended: staged under *Needs the owner* and stopped | the staged command in the report or the *Ask the owner* row; the go recorded in the row |
| **Never** | nobody, in any mode | — |

**The habits are the gate.** *Look before you touch:* read the target's live state first (`ls -la`, `systemctl status`,
the app's API GET, or `kubectl get -o wide` if you run a cluster); if it is not what the brief says it is (other owner, age, state, or a selector reaching
past the named thing) stop and report a mismatch; a brief authorises the action as described, not whatever the name
now points at. *Record the undo:* the exact command or file that restores the previous state, in the report. *Log
it:* `agents/bin/act <initiative|-> "<what>" --undo "<how>" --proof "<path or command>"` for every non-read action.

Staging is the pattern for owner's-hand items: an unattended run stages the thing (a staging folder such as `_to_delete/`, a
prepared manifest, a drafted change, the exact command) and the owner executes it.

**The harness classifier.** If your Claude Code session runs in auto mode, a classifier may deny a tool call it cannot
tie to the owner's words. A denial is never routed around: stop, report the reason verbatim, log
`agents/bin/drift classifier-deny`, leave it to the owner. An owner's-hand go has to name the action in the owner's
own words ("go, delete the old backup volume").

## 4. The verification protocol

Every worker or overseer report ends with an **Attestations** table:

| Claim | Verify with | Expected |
|---|---|---|

The overlord reruns each `Verify with` (itself, or via `verifier` on the cheap model) **before** it
believes the claim, updates state, or surfaces it to <your-name>. A claim without a check is
"reported, unverified" and is surfaced as such. Anything surfaced to <your-name> carries the
originating agent's **verbatim** finding and evidence, not a paraphrase.

## 5. Git flow

- v1: work happens on a branch; the overlord merges to `main` (fast-forward) after gates pass and
  attestations verify. Docs-only or Log-only edits may go straight to `main`. (v2: overseers work on
  `init/<id>` branches in their own worktrees.)
- Every merge ends with the spec's Status line and Log updated (CLAUDE.md rule 2) — the exit
  criterion, checked by the overlord.
- Push to `origin` only.

## 6. Budget

| Run | Default cap |
|---|---|
| one overseer dispatch (v2) | `--max-turns 60`, `--max-budget-usd 5` (subscription usage may ignore the dollar cap; turns always bind) |
| specialists / verifier | bounded by the parent |
| overlord idle | **zero** between ticks — woken by events, by <your-name>, or by the daily governor tick (§7); never a hot loop |

## 7. The governor loop (the one loop)

The framework runs **one cold loop**: a daily tick (`agents/bin/tick`, procedure `agents/prompts/tick.md`)
plus any event wakes you configure. A tick is the overlord procedure run headless (`AGENT_ROLE=overlord`),
so the hooks bind it. It works toward the targets in `roadmap/goals.md`, which only <your-name> edits; it
never chooses a target. It starts in **`propose`** mode (`tick_mode` in `agents/state/ceiling.json`): it
reads, verifies and writes the morning brief with what it *would* close, fix, finish and open, and does
none of it. <your-name> flips `tick_mode` to `act` after reading a week of briefs.

| Rule | Detail |
|---|---|
| **Circuit breaker first** | Before anything else the tick sums today's unattended rows of `state/costs.tsv` against `daily_usd` / `daily_turns` in `state/ceiling.json` and exits if either is spent. The ceiling is a file only <your-name> edits, not a judgment. Attended sessions are not limited. |
| **Single writer** | If a session registry shows another overlord live, the tick exits. <your-name>'s session always wins. |
| **The loop, in this order** | **1 senses**: every executable in `agents/senses.d/` prints findings (`severity · what · evidence · fix-list · runbook`) into `state/senses.tsv`. **2 close**: every row whose evidence says done is closed, consequences swept the same turn. **3 fix**: a finding with a runbook entry and a fair-game fix is fixed (`act`) or its exact command written into the brief (`propose`). **4 finish**: every merged-but-owed row and every *Watching* line is finished if it is fair game, else <your-name>'s part is reshaped to one tap or one phrase and staged. **5 open**: `act` mode only, below the WIP limit, at most **one** new initiative, ranked by `goals.md`. **6 brief**: the strategist procedure writes `arc`, `priorities`, `next`, `threads` and the morning brief. |
| **What a tick may do** | Anything on the **fair-game** list under the three habits (look before you touch, record the undo, log it with `agents/bin/act`). It stages, never runs, anything on the **owner's-hand** list, and never touches the **never** list. In `propose` mode it writes only *Last wake* and the brief. |
| **WIP limit** | At most `wip_initiatives` open initiatives and `ask_backpressure` open asks (`ceiling.json`). At the limit the tick opens nothing and runs steps 1–4 only. Review bandwidth, not agent throughput, is the bottleneck. |
| **Two tries, then ask** | A brief that fails twice (budget-kill, no report, failed attestations) goes to the Ask table — never a third dispatch with a bigger budget. |
| **Done is stated up front** | A brief names the attestations its report must prove. A report without them is "reported, unverified" and counts as a failed try. |
| **Noop is success** | A tick that finds nothing to close, fix, finish or open writes a short brief and one *Last wake* line and exits. It never invents work: candidates come only from `goals.md`, a sense finding or an owed row. |
| **Notifications** | None by default. If `HATCHERY_NOTIFY_CMD` is set in the systemd unit or cron line (outside the repo, where no agent can edit it), the tick may use it (at most `notify_max_per_day` from `ceiling.json`), and only to reach <your-name>. The command is never read from a file an agent can edit. |
| **Cadence** | Daily, before <your-name>'s day (`agents/systemd/` has timer and cron examples), plus a weekly strategist hour (`tick weekly`). |
| **Transitions, not states** | A tick surfaces what changed since the last one; it never re-raises an open ask. |
| **Size** | `agents/bin/rehydrate` prints the ≤6 KB wake view and an OVER CAP alarm when a file passes its `size_caps` entry; `agents/bin/archive-state --apply` (dry run by default, lossless) trims `overlord.md`. |

The strategist (`agents/prompts/strategist.md`) is a procedure read as a file, never a persona. It writes
only `state/arc.md`, `priorities.md`, `next.md`, `threads.md` and `state/brief/`. The numbers in
`ceiling.json` are starting values — tune them at the first overmind review after the tick has run a while.

## 8. Evaluation (not shipped)

The full framework measures itself with a gate regression suite, a report score, golden defects replayed
through the personas and a scorecard (`agents/bin/eval`); none of it ships in the kit. What does ship
is the gate suite (`plugin/hooks/check-gates.sh`) and the habit behind the rest: a real miss becomes a
test case **before** the persona or hook is edited, and an edit that does not change what gets caught is
prose, not a fix. A hook false positive or negative becomes a case in `plugin/hooks/cases.txt` in the
same commit as the hook change.

## 9. Session lifecycle

| Rule | Detail |
|---|---|
| **Close-out** | An attended overlord or overmind session ends by answering the five questions in `agents/prompts/debrief.md` into `agents/state/debriefs/<YYYY-MM-DD>-<role>-<first 8 of the session id>.md` (before `agents/bin/usage session`, if you run it). Nobody grades them; the overmind reads them at each review, and two debriefs naming the same friction get an edit. |
