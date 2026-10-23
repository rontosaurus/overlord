# 01 — Inventory what runs in my home lab

**Status:** not started (YYYY-MM-DD)

*This is an example spec. Copy its shape for your own; delete or rewrite this one.*

## Goal

Know, in one file, every machine and service that runs at home, what it is for, and who notices when
it stops. Nothing is changed in this phase — it only reads.

## Steps

1. List each always-on machine and device: name, role, how to reach it (by pointer, never a password).
2. For each machine, list what runs on it (services, scheduled jobs).
3. For each service, write its availability tier and the people who depend on it.
4. Record the result in `docs/inventory.md`.
5. Flag anything unknown, unowned, or running with no one depending on it — as a question, not a fix.

## Attestations this phase must prove

| Claim | Verify with | Expected |
|---|---|---|
| `docs/inventory.md` exists and lists every machine | `test -s docs/inventory.md && grep -c '^## ' docs/inventory.md` | a count matching the machines you own |
| Every service row names a tier | `grep -c 'tier:' docs/inventory.md` | at least the number of service rows |
| No secret values were written | `grep -ciE 'password *[:=]|token *[:=]' docs/inventory.md` | `0` |

## Log

- YYYY-MM-DD — spec created from the template. Nothing done yet.
