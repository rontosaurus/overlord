# Rotation - carry, successor, close, archive

Run this at the context notice (the hook tells you when), at a close-out where work continues, or when the
owner says "rotate". Why: a successor session starts from a 2-5 KB carry plus your usual short start-up
reads instead of re-writing 150K+ tokens of context after an idle gap - the largest single cost component.

Session-tool steps (create a successor, retitle, archive) need the Claude desktop app's session tools. Without
them (headless, terminal), write the carry, run the checks, and stop at step 3 - say so in one line; the owner
starts the successor by hand with the prompt in step 4.

`<role>` is the persona name you run as (`overlord`, `overmind`, ...). `<carry>` is `agents/state/carry/<role>.md`;
a job session that runs alongside others uses `agents/state/carry/job-<first 8 of its session id>.md`.

1. **Write the carry** (`<carry>`, replacing the previous one; 2-5 KB). Line 1:
   `<role> | <date> | <why rotating> | <this session's full id, or "unknown">`. Then five sections, in this order,
   with these exact headings:
   - `## URGENT in flight` - each item with its ask number / brief path / jobs file;
   - `## waiting on the owner` - asks, and the phrase that clears each;
   - `## done this session` - one line each, with commits;
   - `## open, not urgent`;
   - `## lost on clear:` - any running subagent or watcher, and what the successor must re-check.
   Run `agents/bin/rotate check <carry>`; fix what it names.
2. **Commit** the carry and state if the repo is under git, the way your routing table says (a worker on a branch
   commits where the brief says; the carry file is the one thing that must land on the main branch).
3. **Record the close.** `agents/bin/rotate record --role <role> --old <this id> --carry <carry> --title "done - <what>"`
   (add `--new <successor id> --star-title "<successor title>"` once step 4 has produced one). It appends the
   `closed.tsv` row that `agents/bin/carry` audits, and moves `agents/state/sessions/star-<role>` (the file naming
   the live session for that role) to the successor. One `agents/bin/act` line per rotation if you use it.
4. **Create the successor** (session tool, if you have it): same model and permission mode as this session, prompt
   exactly `Run /hatchery:overlord (or /hatchery:overmind). Continue from carry: <carry> - read it first, then do your usual start-up reads.`
   Keep the returned id and re-run step 3 with `--new`. If the call fails, stop: this session stays the live one;
   log a `drift` line of kind `rotation-failed` with the error and tell the owner.
5. **Retitle and archive** (session tools, if you have them): retitle this session `done - <what>`, then archive
   it. Without the tools, say "rotated -> <successor id or 'start a fresh session'>". Last message: that line.

## The successor's first turn

The session-start hook prints the first 40 lines of a carry written in the last 24 hours. Read the whole carry,
then your usual start-up reads, confirm `agents/state/sessions/star-<role>` names this session (if it does not,
write it), and say in **one line** what you picked up and which `lost on clear` items you re-checked. Do not
reread the predecessor's transcript. Delete nothing from the carry; the next rotation replaces it.

## Close without continuing

A close-out where nothing continues writes no carry: `agents/bin/rotate record --kind done --role <role> --old <id>
--carry - --title "done - <what>"`, then retitle if you can.

## Audit

`agents/bin/carry` lists any rotation in the last 7 days whose carry file was not written within 15 minutes
before its close row (`CARRY MISSING`). Evidence for the review session, never a gate.
