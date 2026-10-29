# What you can build on it

The framework is plumbing: roles, two lists, hooks, attestations, ceilings, a log. This page is about
what that plumbing lets you point agents at. Everything below is drawn from my self-hosted
homelab. Each item is marked **Runs** (I use it), **Built** (written and reviewed, not all
of it switched on) or **Could** (a fit for the framework that I have not built). If a
claim here is not marked, treat it as **Could**.

Nothing here ships in the kit except the framework. The apps are described so you can see the
pattern, not so you can copy a deployment. Which of them apply to you is whatever your own
`roadmap/home-setup.md` says you have, and at what access level.

## 1. How capabilities arise

Each capability below is a consequence of one or two framework pieces, not a feature on its own (the last row is the exception: it is what the framework is plugged into).

| Piece | What it makes safe enough to try |
|---|---|
| Workers that must end with an attestation table, re-run by a verifier | Letting agents touch real systems. A report is only believed after its read-only checks pass again. |
| Read-only reviewers, and a security review as the one merge gate | Exposing things. The reviewer cannot fix what it flags, so "who judged" and "who changed" stay separate. |
| Hooks plus two lists (never, owner's hand) | Unattended runs. A headless role is refused the irreversible shapes and stages them instead. |
| State in files, plus the governor loop (`tick`) | Long-running services with memory: a daily job reads its own files, acts, writes them back, exits. Idle costs nothing. |
| A cost ceiling in a file plus model routing | Work with a spend bound. The cheap tier reads, the mid tier does, the top tier is rationed, and a ceiling the agent cannot edit stops the loop. |
| Drift log plus the overmind review | A system that improves from its own failures. Every block, waiver and slip is a counted line, and the review turns counts into rule changes. |
| **Always-on infrastructure primitives** (network, DNS and tunnel provider, secrets manager, k3s, NAS, identity provider, git forge, phone path, detection loop) | The **app platform** (section 4). With the pieces above in place and each reachable through a scoped API, an idea I talk through with the overlord can be built, wired, backed up and monitored by the framework, with me approving a few named steps. |

Read left to right and you get the order I built things in: verification first, then
exposure, then unattended work, then services with memory and a budget, then self-review, and finally the platform that lets you ask for a whole service.

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
the exact steps. The incident in section 6 is this one. Persona: **on-call**. The lesson I
keep relearning: network mounts that drop present as empty directories, not errors, so every dependent
app looks healthy and empty.

### Network segmentation and device inventory (Built)
A gateway-level plan for separate networks (trusted, IoT, guest, and so on), a device
naming convention, an address plan and an inventory of static reservations. Agents do the
inventory, the arithmetic and the runbook; the gateway write is the internet path, so it is staged
for the owner and always goes through the **security** review. Could: a nightly diff of the
controller's client list against the inventory, reported as drift.

### Self-hosted git forge (Runs)
A private forge holds mirrors of repos, with sign-in required, registration closed, and the built-in
CI features turned off to cut surface and disk. My "CI" is the pre-commit hook: a secret
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

### A tabletop-game DM bridge (Runs)
Friends and I play a tabletop RPG in a self-hosted virtual tabletop, and Claude is the game master.
Anyone at the table types `@dm <what my character does>` in the game chat; the DM answers in
character, in chat, and **speaks the answer aloud at every player's client** in its own voice.

**The table loop, one `@dm` at a time.**
1. A bridge service, logged in to the tabletop as an ordinary player seat (never an admin), sees the
   message and turns it into a job. The job carries more than the text: who sent it and which
   character they play (resolved from the tabletop's ownership records, so the DM never mixes up
   players), a snapshot of the board (tokens, exact distances, each character's movement budget,
   whose turn it is), the current map's terrain notes (cover, line of sight, doors), **pre-rolled
   true-random dice** (a model asked to "roll" skews its numbers; the DM is told to use these in
   order), and the running scene memory, so it does not re-resolve what already happened.
2. A consumer runs a headless `claude -p` in the campaign's git repo with the campaign's full
   history: setting, canon, NPC files, rules cribs, session logs.
3. The reply is narration plus a short list of **bounded action verbs**: roll, move a token, apply
   damage, spend an item, start combat, advance the turn, leave a note for later. An executor in
   the bridge validates each one against a schema and runs it in the tabletop. Harm to a player
   character's sheet (hit points, removing a token or item) is refused by code, not by prompt.
4. If an action fails, the bridge rebuilds the job once with the failure reason and retries,
   instead of dead-ending; a second failure gets an in-character "the world stutters" line.
5. In combat, when the turn lands on a non-player character, the bridge queues that NPC's turn by
   itself, so enemies act on time without anyone prompting the DM.

**The voice.** Narration is synthesized by an open-source neural text-to-speech model on my GPU
and played at every connected client. The model loads on demand and unloads after ten idle
minutes, so it holds no GPU memory between game nights and never crowds the local model that reads
mail. NPCs get their own voices through dialogue tags in the narration, a smaller model on the CPU
voices them, and there is a fallback ladder of lighter engines if the main one is unavailable.
Pronunciation lives in the speech layer, not the prompt: a lexicon file fixes how proper nouns are
said, because the DM writes text and never hears itself. Live play shaped the details: long
narration is chunked and the silence the model pads at chunk edges is trimmed, and punctuation
that made the engine stall is filtered out before synthesis.

**The campaign loop, between sessions.** Everything the DM learns at the table goes into
append-only notes. After a session, an autonomous builder (its own tabletop account with a narrow
role, and no Claude process holds the admin seat) processes those notes end to end: writes the
session log, creates or updates NPC files, folds new canon into the campaign file with prep for the
next session, archives and clears the scene memory, updates journals in the tabletop, and commits
the lot. It can also generate battle maps through an image API and write their terrain notes. The
next `@dm` starts from that. A scheduled prep tick that would write new content on its own is built
but switched off, because unasked-for content at a shared table is a consent call, not a technical one.

**Why it is safe to point at strangers' text.** Player text is untrusted input, passed as content
inside an in-world frame. The DM session has file tools on the campaign repo only (no shell, no
network, no connectors). The bridge's password is fetched in-process from the secrets manager. The
worst a hostile player gets is wasted tokens, an in-character brush-off, or a campaign-file edit,
which is a revertible commit. Could: the same shape for any chat-driven helper.

### Privacy-rights paperwork (Built)
A local-first command-line tool drafts data-subject requests (access, deletion, correction) as
letters and portal field sheets, from a fact table where every citation, deadline and address carries
its source URL and a verbatim quote; unverified rows are marked as drafts and never rendered as
fact. A tracker records submitted, acknowledged, extended, appealed. **Nothing is ever sent.** The
tool prepares the packet; the owner sends it. Persona: **researcher** builds the fact table, a
re-fetch spot-check verifies it. Could:
- **Status monitoring.** A daily sense reads the tracker and flags each request whose statutory
  deadline is near or passed with no response, and drafts the follow-up or the escalation (an
  extension check, an appeal, a regulator complaint) for me to send. Where a company offers a
  request-status page or replies by mail, the agent can read the status (mail through the local
  model) and update the tracker, so "did they answer?" becomes a line in the morning brief instead
  of a calendar reminder.
- **Source re-checks.** Monthly re-fetches that the quoted sources still say the same thing.

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

### Sensitive analysis on a local model (Runs, and Built)
The most sensitive data is analysed by a small model running on my own GPU, not by a cloud model.
The rule is simple: the local model reads the raw content, and only what a deterministic filter
allows ever leaves the box.
- **Mail (Runs).** A local model classifies mail and extracts fields under a fixed schema, so mail
  content never reaches a third-party model; identity mail is classified locally only, and any
  action crosses a schema-only boundary with approve-first defaults.
- **Documents (Runs).** In the document vault the local model *proposes* each document's disclosure
  class (full, summary, redacted, never), a stored class *decides*, and code *enforces* it, with hard
  floors for sensitive document types that no model output can lift.
- **Finance (Built, not yet switched on).** The ledger never leaves the machine. The design: a local
  model turns a plain-English question into SQL, and a deterministic egress filter, not the model's
  judgment, lets out only aggregates (sums, counts, category names, months) with a minimum count so
  a single transaction cannot be re-identified. No merchant or memo free text leaves, because text
  from a bank feed is an injection channel. A cloud model then writes the brief from those
  aggregates only.

The model shares the GPU with media transcoding, so heavy work is scheduled around busy hours. It
was gated on measured accuracy (classification, field exactness, zero hallucinated and zero
schema-violating outputs over a test run) before it was trusted.

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
or `jq 'del(.secret_field)'`. A pre-commit scan catches secret-shaped strings. The honest part: the slip recurred in
my log (values reaching a local transcript or file), which is why the rule is in every prompt
and a golden case, not one.

**Domain separation.** Three domains with three jobs: one for identity and people, one for commerce
(email only), one for all infrastructure with zero email. No CNAME between zones, no mail on the
infrastructure domain, no service on a mail domain. A new hostname that crosses it fails review as a rule.

**LAN-only pages with no login, versus internet-facing ones behind SSO.** A read-mostly status or
digest page on the LAN has no login when it sits on a trusted network segment and holds only content fit for anyone on it,
and the security review checks the content before it is published. Anything reachable from the internet carries an identity
gate in front, with a per-user passkey, and an admission rule before it is allowed through.

**Opt-out automation that drafts and never sends.** The privacy-rights tool prepares the letter,
the portal field sheet and the tracking row. Sending is the owner's act, never an agent's.

**The public-export leak check.** This repo is itself an example. The export script greps the
whole tree, dotfiles included, for a list of names, hosts, addresses, dates, identifiers and
personal terms, and refuses to build if any matches. Hits are reviewed and rewritten by hand, never
auto-replaced. Each edition carries its own allow list, so terms allowed in one build still fail another. A failed leak check is a build failure, not a warning.

## 4. An app platform: from an idea to a running service

The framework alone is plumbing. What turns it into a platform is what it is plugged into. My
setup has a handful of always-on infrastructure primitives, each reachable by an agent
through an API or a command, each with a scope. Together they mean I can think an idea
through with the overlord and have the pieces **built, wired, backed up and monitored by the
framework**, with me approving a few named steps. This section says which
primitives, what the flow looks like, where my hand still is, and two real examples.

### The primitives

| Primitive | What the framework does with it |
|---|---|
| **The network**: a gateway, LAN DNS, segments | Reads and (through staged, reviewed steps) writes names and address reservations. A new service gets a LAN name by default. |
| **A DNS and outbound-tunnel provider**, reached through its API with a scoped token | Creates records for a new name. The token is limited to the one zone it needs, is fetched in-process, and every write is a staged exact command. |
| **A secrets manager**, read by the agents in-process | A machine account scoped to one project. A worker creates or reads a service's keys from it without printing them. Vault-unlock material lives in a different project that account can never be granted. |
| **An always-on single-node k3s cluster** | Where containers run. Manifests are written to a convention: pinned image digest, non-root, no service-account token, a network policy per pod, an ingress with a wildcard certificate already in place. |
| **A NAS** for durable state and backups | A nightly backup job per service writes there, retention is set, and the restore is drilled. The tier decides whether a service is backed up at all. |
| **An OIDC identity provider with passkeys** | Single sign-on and a forward-auth gate in front of any app that people outside the house will use; a per-app client is registered by an API call. |
| **A self-hosted git forge** | The system of record: one branch per initiative, merge after verification, every change recorded with its undo. |
| **A phone notification path, owner only** | Asks, alerts and the morning brief reach one phone through one command with a hard-coded target. |
| **The detection-and-remediation loop** | Senses (cheap checks), an on-call role, the `tick` that dispatches, runbooks, and alarms that never live on the box they watch. A new service is added to it as part of being built. |

### The flow

1. **Think it through.** The overlord and I talk the idea through until it is a brief:
   what it is for, who uses it, what it stores, and an **availability tier** (rule: every new
   service gets one at design time, and the tier decides placement and backup).
2. **Design review**, for a new service or a new design. A read-only reviewer reads the brief and
   returns a verdict; findings are folded into the brief before anything is built.
3. **The overseer dispatches workers**, each ending with an attestation table. Typically: manifests
   and a namespace; a network policy; the service's secrets created through the secrets manager;
   an OIDC client registered if people sign in; a LAN name, or a DNS record if it is to be reached
   from outside; a backup job to the NAS; a sense and an alarm for its health; and the docs and
   the roadmap updated.
4. **Security review**, the one merge gate, for anything that is exposed, touches identity or adds
   a write path. The reviewer cannot fix what it flags; findings are applied and re-checked.
5. **A verifier re-runs the attestations** from the workers' reports. Only what passes a second
   time is believed.
6. **Merge and apply**, then **the loop watches it**: its sense runs, its alarm is armed, its
   backup shows up on the NAS, and a failure goes to the on-call role like any other.

**Where my hand still is.** Honestly: the internet path (gateway, DNS and
tunnel writes, certificates), the identity provider's core, storage layout and the mover,
irreversible deletes, and anything that sends something to a person. These are on the owner's-hand
list, and the framework does not do them on its own. It shrinks each to one tap: the worker
prepares the exact command, stages it, and stops; in an attended session I approve that
command on a phone prompt, or answer an *ask* row with a stated reply phrase. Everything not on
the two lists (never, owner's hand) is fair game, under the three habits: look at live state first,
record the exact undo, log the action. "Largely without oversight" means exactly that: my
oversight is the idea at the start, a few taps along the way, and the alarms afterwards.

LAN-only is the default for anything new. Anything reachable from the internet sits behind the
identity gate and passes the security review, and the apply checks prove that an anonymous request
is refused.

### Example 1: a game-library app

*The idea.* I wanted a browsable library for a collection of game files that were scattered
across the NAS, and to use it away from home.

*Pieces built, in one working day.* A research pass produced a fact sheet on the app's stack and
how it writes to its library. The overseer's worker produced: a database and the app in their own
namespace, with persistent volumes; the library mounted read-only, one folder at a time (the
build departed from the brief here, and argued it, because a single mount would have collapsed
thousands of files into one "game"); network policies for both pods; a secrets entry created
in-process; a nightly backup job writing dump, assets and config to the NAS with 14-day retention;
a LAN name; and a runbook with the staged steps for later. The design reviewer assigned the tier
and the security reviewer approved with changes (no service-account tokens, a hardened security
context, a fail-closed procedure for the later exposure step); a second round folded all of them.

*My taps.* Opening the work ("now, this one"); one phrase to apply; then two things by
hand in a browser: creating the first admin account and starting the first library scan, outside
busy hours. Nothing else in the build.

*How it is watched.* The first backup run **failed** (the dump could not connect), and the worker
stopped instead of retrying; after the fix the overlord verified a real backup set with the
database's triggers present. The overlord's own verification then checked readiness, the health endpoint by name, the network policies and the backup set.

### Example 2: a file-drop page for a friend

*The idea.* "I want a friend to be able to drop files onto a share on the NAS." One sentence.

*Pieces built.* The researcher compared three candidate apps from primary sources, in a table, and
overturned the brief's default pick because the resumable-upload feature of the favourite was
paid-only. The design: a write-only folder per person, a quota, resumable chunked uploads under the
edge's body-size cap, a read-only filesystem, deny-all egress, a mount that cannot execute files,
and a hook that vetoes risky uploads. A new share on the NAS and its user were staged as the
owner's hand (storage layout), with the exact UI steps written. The two reviewers both approved with
conditions; every condition became either a change in the manifests or a named stop-check in the
apply order. Later, small asks were one-line changes: raise the quota, simplify the page.

*My taps.* The idea; answers to a few questions in the report (each with a reply phrase);
creating the share and its user on the NAS by hand; one approval for the public DNS record,
given in an attended session; the signed-in browser checks that need a real passkey; and sending
the friend their sign-up link, which is on the never list. The design was ready the same day; the
service was reachable by name about a day after the request.

*How it is watched.* A check that anonymous requests are refused was written into the existing
exposure probe, staged for its next apply. One agent write to the identity provider was refused by
the permission classifier and was handed back as a staged command for the owner's go.

### Patterns you can reuse

- **The tier decides placement and backup.** Decide it at design time; a transient inbox is not
  backed up, a library with a database is.
- **Ceilings and modes in files the agent cannot edit.** Spend limits, caps and modes are protected
  by deny rules and the shell guard; the agent reads them and obeys.
- **Propose, then act.** Run a loop in propose mode first; flip it to act when the proposals have
  been boring for a while.
- **One tap for the owner.** Reshape every remaining human step until it is one tap or one phrase,
  and let aging items be reshaped rather than rot.
- **Every new service gets a sense and an alarm, off the box.** The monitor is part of the build,
  not a follow-up.
- **Every exposure goes through the security gate**, and the apply checks include a request that
  must be refused.
- **Stop on the first failure.** A worker whose step fails reports and stops; a retry that "fixes"
  it hides what happened.

## 5. External access and security

**Security is the only merge gate.** The triggers: ingress or a reverse proxy, TLS, a tunnel, the
identity provider, a firewall or network policy, a new internet-reachable surface, and anything that
reads or moves a token. The reviewer is read-only and returns approve, approve-with-changes (listed)
or block. The overseer can skip other reviews with a stated reason; it cannot skip this one.

**LAN-only is the default.** Exposure is opt-in per service, and an opt-in names what the third
party in the path learns. My classes:

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

**A machine that isn't always on can't host anything unattended.** My desktop PC, which is
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

**Debriefs.** Every piece of work ends with one, and none of it is ceremony:
- *Every report has a drift section*: what felt wrong, a rule worked around, a persona that lacked
  context, a gate that fired uselessly or failed to fire. The overlord copies each into the drift log
  with a kind label.
- *An incident gets a write-up* in a fixed shape: timeline, diagnosis, what was ruled out, any routing
  slip (for example, an hour spent poking by hand before on-call was asked), and the follow-ups,
  which become *Watching* lines with a check, not good intentions.
- *The overmind review reads the debriefs together* with me, roughly monthly: was routing right,
  were gates respected, did the spirit hold. The outcome is edits to personas, prompts, routing or
  hooks, or deleting something nobody used.
- *A lesson becomes a test before it becomes a rule.* A real miss is frozen as a golden case first,
  then the persona is changed, then the case is replayed, so the next debrief can say whether the
  change actually helped.

**Checking that a change actually helped.**
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

**Phone push via a notify command.** The kit sends nothing by default. If you set `HATCHERY_NOTIFY_CMD`
in the tick's systemd unit or cron line (not in `ceiling.json`, which the agent could otherwise steer),
the tick may use it, up to `notify_max_per_day`, and only to reach you. Make your command
refuse any target but your own, and keep a per-channel vocabulary (asks, alerts, info) so the
notification light means something.

**The board mod.** `kit/mods/overlord-board` draws a band above the prompt (now, on deck, alarms,
tick, ceiling) and a `/board` pane from a JSON file, at zero model tokens. It draws only on the host's
own surface (a desktop app or terminal), not on a phone or web client; the local board page is the
surface for remote sessions.
