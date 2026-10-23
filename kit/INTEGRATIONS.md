# What you can build on it

The framework is plumbing: roles, two lists, hooks, attestations, ceilings, a log. This page is about
what that plumbing lets you point agents at. Everything below is drawn from the author's self-hosted
homelab. Each item is marked **Runs** (the author uses it), **Built** (written and reviewed, not all
of it switched on) or **Could** (a fit for the framework that the author has not done). If a
claim here is not marked, treat it as **Could**.

Nothing here ships in the kit except the framework. The apps are described so you can see the
pattern, not so you can copy a deployment.

## 1. How capabilities arise

Each capability below is a consequence of one or two framework pieces, not a feature on its own.

| Piece | What it makes safe enough to try |
|---|---|
| Workers that must end with an attestation table, re-run by a verifier | Letting agents touch real systems. A report is only believed after its read-only checks pass again. |
| Read-only reviewers, and a security review as the one merge gate | Exposing things. The reviewer cannot fix what it flags, so "who judged" and "who changed" stay separate. |
| Hooks plus two lists (never, owner's hand) | Unattended runs. A headless role is refused the irreversible shapes and stages them instead. |
| State in files, plus the governor loop (`tick`) | Long-running "apps" with memory: a daily job reads its own files, acts, writes them back, exits. Idle costs nothing. |
| A cost ceiling in a file plus model routing | Apps with a spend bound. The cheap tier reads, the mid tier does, the top tier is rationed, and a ceiling the agent cannot edit stops the loop. |
| Drift log plus the overmind review | A system that improves from its own failures. Every block, waiver and slip is a counted line, and the review turns counts into rule changes. |

Read left to right and you get the order the author built things in: verification first, then
exposure, then unattended work, then apps with memory and a budget, then self-review.

## 2. Integration catalogue

For each: what the agents do, which persona or gate is involved, what stays the owner's hand.

### Home automation and presence (Runs)
A home-automation hub holds the device and automation state. Agents write its package files and call
its services (fair game, with the undo recorded). Its core files, its config registry, a restart
and its recorder are on the owner's-hand list, because a bad edit there takes the whole house with
it. Personas: **stakeholder-impact** (who is home, is something playing) before a change in
busy hours. Owner's hand: core config and anything touching a lighting bridge. Could: presence entities
as a sense, so the tick knows whether anyone is home before it restarts anything noisy.

### Media library management and acquisition pipeline monitoring (Runs)
A media server, a second media server for outside viewers, a TV/movie manager pair, a download
client behind a VPN sidecar, an indexer manager, a subtitle tool. Agents rename, dedupe, audit
libraries and stage removals into a `_to_delete` folder. A "report a problem" button in the
request app triggers a small fixer that opens the right remediation. Personas: **worker** for the
changes, **scout** (cheap tier) for inventory, **stakeholder-impact** habit: check active sessions
before restarting a media service, avoid busy hours. Owner's hand: any real delete on a media mount,
and anything money-shaped (subscriptions). Dual-server awareness matters: every viewer-facing change
has to cover both servers. Could: stuck-queue and database-health checks as `senses.d` scripts.

### Photos, documents and OCR vault (Runs)
A photo library (imported once, verified, restore-drilled) and a document vault with OCR, tags and
dedupe. Agents run jobs, check backups, report counts. The data roots are on the **never** list:
`H4_NEVER_PATHS` refuses `rm -r` and `find -delete` naming them, in every mode, including with the
owner's tap. Owner's hand: removing anything. Could: an agent that proposes tags and filing for new
scans, with the owner approving in batches.

### Storage arrays, UPS and power-outage recovery (Runs)
A bulk-media array, a durable NAS that holds the git origin and backups, and a UPS monitored over
the network from each machine it powers. Agents read mounts, SMART, array state and UPS history, and produce
the diagnosis. Array start/stop, share layout and host power are owner's-hand; the framework stages
the exact steps. The incident in section 6 is this one. Persona: **on-call**. The lesson the
author keeps: network mounts that drop present as empty directories, not errors, so every dependent
app looks healthy and empty.

### Network segmentation and device inventory (Built)
A gateway-level plan for separate networks (trusted, IoT, guest, and so on), a device
naming convention, an address plan and an inventory of static reservations. Agents do the
inventory, the arithmetic and the runbook; the gateway write is the internet path, so it is staged
for the owner and always goes through the **security** review. Could: a nightly diff of the
controller's client list against the inventory, reported as drift.

### Self-hosted git forge (Runs)
A private forge holds mirrors of repos, with sign-in required, registration closed, and the built-in
CI features turned off to cut surface and disk. The author's "CI" is the pre-commit hook: a secret
scan, a rule that code changes need a doc change, and the gate regression suite when hooks change.
Agents do all the git: branch per initiative, fast-forward merge after verification, push at session
end. Owner's hand: history rewrites and deleting or resetting the main branch (hook-asked).
Could: a runner for the same checks, behind the same review as any new service.

### Identity provider and SSO forward-auth (Runs)
An OIDC identity provider with passkeys, and a forward-auth gate in front of the few apps shared
with people outside the home. The identity provider and its namespace are on the owner's-hand list
and sit on the **security** review's trigger list. Agents write the manifests and the apply
checks (an anonymous request gets a redirect; a forged identity header is ignored because the gate
runs first). Owner's hand: the apply, and every passkey enrolment.

### Remote access (Runs)
Three classes. **LAN-only** is the default; internal names resolve through the gateway's static DNS
and never exist in public DNS. An **outbound tunnel** carries a few named web hostnames, each behind an identity check.
A **VPN** carries phone access to everything else, including bulk media. Services shared with outside users sit behind an identity gate (section 5). Agents draft, check and monitor; the gateway, DNS zone, tunnel and
TLS are the internet path and stay the owner's hand.

### Personal finance (Runs)
A bank-data aggregation bridge pulls transactions into a local SQLite ledger. A monthly scheduled
run reconciles balances, flags anomalies, flags items that need a second look and writes a monthly brief
with a plain-English paragraph on where things stand. The ledger and statement archive live only on the
owner's machines and local NAS; finance data is on the never-delete list and its paths are in
`H4_NEVER_PATHS`. Agents compute and draft. Owner's hand: money movement, always, and any
account linking.

### A job-search engine (Runs)
Section 4 walks through this one. In short: sense listings from public job-board APIs, score with a
mid-tier model with the company name redacted, show a ranked digest on a LAN page, and tailor a
resume on demand from a button, under a monthly ceiling. Owner's hand: every send. The agent never
posts, applies or messages; the owner pastes or clicks Submit in their own browser.

### A tabletop-game DM bridge (Runs)
Players type `@dm <question>` in a virtual-tabletop chat. A bridge service queues the text, a
consumer runs headless `claude -p` in the campaign repo, and the reply is posted back (and spoken).
The agent here acts on untrusted input, so the design is the point: player text is passed as content
inside an in-world frame; the session has file tools on the campaign repo only (no shell, no
network, no connectors); the bridge logs in as an ordinary player seat, not an admin; its password
is fetched in-process from a secrets manager. The worst a hostile player gets is wasted tokens or a campaign-file edit, which is a revertible commit, and a
brush-off. Every ruling is a commit. Could: the same shape for any chat-driven helper.

### Privacy-rights paperwork (Built)
A local-first command-line tool drafts data-subject requests (access, deletion, correction) as
letters and portal field sheets, from a fact table where every citation, deadline and address carries
its source URL and a verbatim quote; unverified rows are marked as drafts and never rendered as
fact. A tracker records submitted, acknowledged, extended, appealed. **Nothing is ever sent.** The
tool prepares the packet; the owner sends it. Persona: **researcher** builds the fact table, a
re-fetch spot-check verifies it. Could: monthly re-checks that the quoted sources still say the
same thing.

### Phone notifications to the owner only (Runs)
One command sends pushes, and its target is hard-coded to the owner's own phone. Three channels
carry the vocabulary: "asks" (something waits on you), "alerts" (something broke), "info" (the
morning brief, quiet). A daily cap and a URL allow-list apply to the tap target. The hook refuses
any other target (section 3). Could: a different channel mapping for a different device.

### Calendars and package tracking (Runs, plus Could)
A self-hosted CalDAV server is the offline-tolerant tier: every synced client holds a full copy.
Agents read; connector tools that write events or RSVP are in the deny list, because an invite is a
message to someone else. Shipment mail is classified locally and shown on a hub pane, and its
staleness alarm lives on the hub, not the host that runs the poller. Could: read-only "what's on
this week" feeding the morning brief.

### A self-hosted LLM on a shared GPU (Runs)
A small local model classifies mail and extracts fields, so mail content never reaches a third-party
model. It shares the GPU with media transcoding, so heavy work is scheduled around busy hours.
It was gated on measured accuracy (classification, field exactness, zero hallucinated and zero
schema-violating outputs over a test run) before it was trusted. Could: use it as the cheapest
tier for bulk triage.

## 3. Privacy by construction: worked examples

**Never-send, enforced per target.** The `never` list holds the people and shared channels that
must not receive an automated message. `guard.conf` `H1_PATTERNS` names, for example, a device that
is not yours. The hook refuses any command or MCP tool call matching it, in
every mode, and a pure read of the literal (a grep) is allowed. Delivery is then verified per
target: a helper that reports success because one channel worked would hide both a dead target and
an unintended one. The rule exists because a test push once reached a device it should not have; a message
to someone else cannot be taken back, so it is a permission, not a preference.

**Secrets are fetched in-process and never echoed (H2).** A worker that needs a key runs
`VAR=$(secrets-cli get <named id>)` and uses `$VAR`. The hook refuses a bare "list everything" call
(it prints every value), a fetched value redirected or piped into `cat`/`tee`/`echo`, and a
secrets project other than the one granted. The credential-file rule rides in every worker prompt:
never read a credential-bearing file whole; project exactly the attribute asked for with `grep -o`
or `jq 'del(.secret_field)'`. A pre-commit scan catches secret-shaped strings. The honest part: the slip recurred in the
author's log (values reaching a local transcript or file), which is why the rule is in every prompt
and a golden case, not one.

**Domain separation.** Three domains with three jobs: one for identity and people, one for commerce
(email only), one for all infrastructure with zero email. No CNAME between zones, no mail on the
infrastructure domain, no service on a mail domain. A new hostname that crosses it fails review as a rule.

**A scorer that cannot be impressed by a brand.** The job-scoring prompt receives postings with the
company name removed, and the name is re-attached after scoring. Code, not the model, validates the
output (fit range, cited claim ids exist in the inventory). The point is not secrecy; it is that
brand should not buy rank.

**LAN-only pages with no login, versus internet-facing ones behind SSO.** A read-mostly status or
digest page on the LAN has no login when it sits on a trusted network segment and holds only content fit for anyone on it. It is only used for content the author is content for anyone on that
network to read, and the security review checks the content (it once caught a private contact claim
that would have appeared on the page). Anything reachable from the internet carries an identity
gate in front, with a per-user passkey, and an admission rule before it is allowed through.

**Opt-out automation that drafts and never sends.** The privacy-rights tool prepares the letter,
the portal field sheet and the tracking row. Sending is the owner's act, never an agent's.

**The public-export leak check.** This repo is itself an example. The export script greps the
whole tree, dotfiles included, for a list of names, hosts, addresses, dates, identifiers and
personal terms, and refuses to build if any matches. Hits are reviewed and rewritten by hand, never
auto-replaced. Each edition carries its own allow list, so terms allowed in one build still fail another. A failed leak check is a build failure, not a warning.

## 4. An app platform: the job-search engine, end to end

The pattern, with the framework pieces called out at each step.

1. **Timers.** Systemd user timers on an always-on host: sensing twice a day (plain code, no
   model), then scoring and the digest once a morning on weekdays. A device that is not always on
   hosts nothing here.
2. **Sensing.** Code polls public job-board APIs (applicant-tracking-system boards, a monthly
   forum thread, a remote-jobs feed, an aggregator with a personal-research tier). A listing is
   marked closed only by absence from a *successful* fetch of its own board; a failed fetch changes
   nothing. No scraping of sites whose terms forbid it, no profile automation, nothing logs in as
   the owner.
3. **Scoring under a ceiling.** A mid-tier model scores batches of redacted postings: fit, three
   strongest matched claims, three gaps, pay against a configured floor, work-mode match. Code
   enforces the enums and the rules. A state file holds the month-to-date spend; each run has a hard
   per-run budget and reads the file first.
4. **A static page, served read-only.** The digest is rendered to one HTML file. A tiny
   standard-library server in a pod mounts the rendered directory read-only; it cannot see the repo,
   the scores, the cluster, or any secret, and has no service-account token or outbound network. CSP
   denies everything but its own styles.
5. **POST request queue.** Each posting card has buttons: *generate resume*, *opened*, *sent*, *not
   sending (reason)*, and a *generate anyway* override. A POST must carry an `Origin` that exactly
   equals the page's own, `Sec-Fetch-Site: same-origin`, a fixed content type and length, only known
   fields, a CSRF token, a listed posting id, and an enum op. Failures are 4xx with no echo. The pod
   limits requests per hour and per posting per day, and refuses when the queue holds too many
   files. Its only writable path is the queue directory, a small tmpfs, one file per accepted
   request, created exclusively without following links.
6. **A host unit drains the queue.** A systemd path unit wakes a host-side consumer that
   *re-validates everything the pod did* (the pod's limits reset when it restarts, so the host
   ceiling is the control). The override has its own bounded count per day and does not skip the
   monthly cap.
7. **The tailor runs under the ceiling.** Before a top-tier call the run reserves a fixed amount
   against the ceiling and reconciles after. The posting is re-fetched live first so a closed one
   does not cost a run. The model may select, order and reword claims from an evidence inventory; a
   lint gates every output: a line without a claim id, an unknown id, or a number not in that
   claim's metric fails the render.
8. **Results back on the page.** The page re-renders with the resume, cover note and an alignment
   report linked from the card. A one-tap *opened* takes the owner to the staged files; the owner
   submits from their own browser.

What each framework piece contributed:

- **Security review (required, the one merge gate).** The design added a new write path (the request
  queue) and a token, so it was required. It found a private contact claim that would have been
  rendered to the LAN page as a "where you match" label (fix: only claims marked public are ever
  listed, and no label list at all if labels cannot load). It found that the queue directory needed a
  mount-before-apply ordering, because a pod started before the mount keeps writing underneath it.
  It also asked for the tailor's reserve-then-reconcile spend, and for the override's own cap.
- **The owner's own phone use found the stale-token bug.** The page rotated its CSRF token on every
  render, so any tab left open for a few minutes was rejected. Fix: reuse the token for a day, show a
  clear "page out of date" page on mismatch, and refuse a token file older than a bit over a day.
- **The spend bound.** `ceiling.json`-style state is in the agent's `deny` list for editing, so the
  loop cannot raise its own limit. Sensing and scoring cost on the order of a dollar a day; tailoring
  is the real spend, which is why it has the reserve and the override cap.
- **Verification.** Each build step ended in attestations that were re-run, including a test that
  *exercised* the server (a script that runs the real handler on localhost and expects specific
  status codes), not only one that inspected it.

State as of writing: all of it runs — sensing, scoring, the page, the request queue, the host
consumer and the tailor. The root-owned host steps were the owner's hand: the agent built to that
line, staged the exact commands, and stopped until they were run.

**Patterns you can reuse**

- **Static page plus request queue.** Serve a rendered file read-only; take actions as small
  validated files in a queue; let a different, privileged process act on them after re-checking.
- **Propose, then act.** Run the loop in propose mode first. Read what it would have done. Flip it
  to act when the proposals have been boring for a while.
- **Ceilings in files the agent cannot edit.** Spend limits, caps and modes live in files that the
  deny rules and the shell guard protect. The agent reads them and obeys them.
- **One tap for the owner.** Reshape every remaining human step until it is one tap or one phrase:
  an approval prompt, a button, a yes. Aging items get reshaped, not left to rot.

## 5. External access and security

**Security is the only merge gate.** The triggers: ingress or a reverse proxy, TLS, a tunnel, the
identity provider, a firewall or network policy, a new internet-reachable surface, and anything that
reads or moves a token. The reviewer is read-only and returns approve, approve-with-changes (listed)
or block. The overseer can skip other reviews with a stated reason; it cannot skip this one.

**LAN-only is the default.** Exposure is opt-in per service, and an opt-in names what the third
party in the path learns. The author's classes:

- **LAN only.** Static DNS in the gateway, a wildcard certificate (so the names never reach a
  public certificate log), no public record. The default.
- **Outbound tunnel for named hostnames only.** Each behind an identity check.
- **VPN for the phone.** Personal and bulk use, including media, goes over the VPN.
- **Shared with outside users.** An identity gate (OIDC with passkeys) in front of anything reachable
  from the internet, plus an admission rule per app; the apply checks prove an anonymous request is
  refused.

**Alarms never live on the box they watch.** The staleness alert for a poller runs on the hub, not
the host that runs the poller. A watchdog that dies with its subject is a diary.

**Availability tiers are assigned at design time.** Four tiers, by how bad downtime is and how
portable state is: offline-tolerant by protocol (calendars, contacts), deferred-processing (queues
that catch up: mail pipelines, package tracking, backups), inconvenient (media, photos, dashboards), and
hard-availability (receiving mail; break-glass access), which is *not self-hosted*. A new service
cannot be added without a tier, and the tier fixes where it may run and what backup it owes
(restore-tested, with a written cold-standby runbook).

**A machine that isn't always on can't host anything unattended.** The author's desktop PC, which is
switched off most of the time, is the standing example: no scheduled session, no timer, no service, because "the always-on box" was a
claim nobody could keep true. It may be a client or a last resort, flagged as one.

## 6. Investigating with agents

Frameworks like this get used for incident work as much as for building. These are the parts that
matter for diagnosis, in the order they show up.

**Incident, on-call first.** Anything shaped like "X is down", an alert, or "is X working?" is
routed as an incident. The **on-call** persona runs before anyone restarts anything. It has read-only
tools plus diagnostics, so it cannot make the situation different from the one it is describing. It
returns a fixed shape: symptom, timeline, diagnosis with a confidence, what it ruled out, and a
recommended action that says *which list the action is on*. The "ruled out" list is the part a
human reads first: it is the work you did not have to repeat.

**"Is X working?" is an incident.** That phrase is how most outages are actually detected, by a
person noticing. Routing it as an incident (not a quick curl by the overlord) keeps the habit of
looking at logs, mounts and dependencies before a verdict.

**Senses as auto-investigation.** The governor tick runs every executable in `agents/senses.d/`
before the model starts. A sense prints findings as rows (severity, what, evidence, fix-list,
runbook) and prints nothing when well. Only tracked, committed scripts run, so an agent cannot
quietly add a sense that executes. With a finding in hand, the tick checks whether a runbook entry
and a fair-game fix exist; if so it fixes it (or, in propose mode, writes the command into the
brief); if not it escalates. A thing breaks, and the next morning's brief starts with evidence
instead of silence. The kit ships two example senses (disk free, failed units); write one for
anything you care about. An important limit: the framework never noticed the outage in the example
below by itself. Detection was a person. Senses are the answer to that.

**Several agents, narrowing hypotheses.** For a non-trivial question the overseer can dispatch scouts
(cheap, read-only) and verifiers in parallel, each looking at one hypothesis (is the mount there; is
the credential valid; is the network path up), and each ending in the attestation table. The overseer
merges: contradictions between tables are the signal. Computing over data is a worker's job, not a
scout's, because the cheap tier mis-aggregates.

**Skills and personas encode domain expertise.** A persona is a plain file: what to check, in
what order, which thresholds mean what, which runbook applies. Expertise improves by editing a
file and replaying the cases it should catch.

**Evals that tell you whether an agent got better or just different.**
- *Golden-defect replay.* A real miss is frozen as an input and replayed through the persona that
  should have caught it, at its own model row. A change that does not move the catch rate is prose.
- *The gate regression suite.* Every real block, ask and accepted false positive is a case; the
  suite runs on every change to the hooks.
- *The scorecard.* Drift by kind per week, gate false positives, cost per initiative, golden catch
  rate, ask-queue age. It is generated from files, so it can be diffed.
- *Drift kinds per week.* A kind that rises is a finding. A gate waived over and over is mis-scoped.

**Honest limits.** The framework catches mistakes of fact and of process (a claim with no output, a
verdict that asserted unearned approval) much better than a persuasive wrong design. The cheap tier
is only as good as its brief: a scout once listed a directory and reported a present file missing.
The hooks are pattern matches over command text, not a sandbox.

### A short walk-through

This follows `EXAMPLE-INCIDENT.md`, with the same invented names.

1. **Trigger.** Day 3: "is the main app working?" The overlord routes it as an incident and
   dispatches **on-call**.
2. **Diagnosis.** Pages load, every library shows zero items. Two dependent apps report their
   storage paths missing. The network mounts on `media-box` point at `nas-one`, which is
   unreachable; the UPS history shows a mains event and a clean shutdown on day 1. Confidence: high.
   Ruled out: disk full on `media-box`, expired credentials, a switch fault, the app's own data.
3. **Recommended action.** Power on `nas-one` through its remote power control. This is host power,
   on the **owner's-hand** list; on-call says so rather than doing it.
4. **Containment (fair game).** The two dependent apps are scaled to zero, so they cannot react to
   "missing" folders by marking items absent. The undo (scale back) is recorded and logged.
5. **Staging.** The power-on goes into the overlord's asks as a numbered item with the steps. The
   owner does it, attended.
6. **Recovery.** Wait for storage to serve, re-mount the shares by address, restart the dependent
   apps, scale the two contained ones back up, rescan, compare counts to the pre-outage numbers.
7. **Follow-ups as Watching lines.** "Make `nas-one` restart on its own after a power loss"; "add a
   check on the share so the next outage is noticed in minutes"; each a row in state with an owner
   and an age, reshaped if it sits.
8. **Notes to the overmind.** The alarm that should have caught this had been built outside the
   framework and never tested by breaking it; the routing slip (an hour of poking by hand) is a
   drift line. The overmind turns them into a session-start reminder and a share-missing sense.

## 7. Connecting things

**MCP connectors** (calendar, tasks, mail drafts) go behind the same rules. Read tools are
fine. Anything that sends or writes to another person (mail send/reply/forward, calendar event
writes and RSVPs, task comments and assignments) goes in the permission `deny` list, by tool name,
via the plugin's settings merge. A deny holds in every permission mode, bypass included. Drafting is
fine; sending is the owner's.

**CLI and API tools go through workers.** A worker calls the service's own CLI or HTTP API, quotes
the live read before it writes, logs `act` with the undo, and ends with attestations. Provider hosts
whose writes you cannot undo (a DNS zone, a registrar) belong in `H4_PROVIDER_HOSTS`: reads pass,
writes ask you at the keyboard and are refused unattended.

**Kubernetes through kubectl, with the owner's-hand list.** Named restarts, rollouts, scale to zero,
applies of a reviewed manifest and named pod deletes are fair game. Deletes of volumes, namespaces
and secrets, anything by label selector or `--all`, and the system namespaces are the owner's hand.
"Look before you touch" is concrete here: `kubectl get <kind> <name> -o wide`, compare owner, age and
state with the brief, and stop on a mismatch.

**Webhooks and timers.** A systemd user timer (or cron) runs the tick; an alarm in another system can
call a webhook that wakes a one-shot session. The tick's wake kinds are a small list in a file. Keep
the alarm in the other system, off the box it watches.

**Phone push via a notify command.** The kit sends nothing by default. If you set `notify_cmd` in the
ceiling file, the tick may use it, up to `notify_max_per_day`, and only to reach you. Make your command
refuse any target but your own, and keep a per-channel vocabulary (asks, alerts, info) so the
notification light means something.

**The board mod.** `kit/mods/overlord-board` draws a band above the prompt (now, on deck, alarms,
tick, ceiling) and a `/board` pane from a JSON file, at zero model tokens. It draws only on the host's
own surface (a desktop app or terminal), not on a phone or web client; the local board page is the
surface for remote sessions.
