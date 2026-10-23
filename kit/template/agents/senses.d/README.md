# senses.d — pluggable "what broke" checks for the tick

Every executable `*.sh` here is run by `agents/bin/tick` (30 s timeout each) before the model starts. A sense
prints **zero or more rows, TSV, one finding per line**, and prints nothing when all is well:

```
severity<TAB>what<TAB>evidence<TAB>fix-list<TAB>runbook
```

| Column | Values |
|---|---|
| `severity` | `warn` (needs attention) or `crit` (broken now) |
| `what` | one short phrase: *which* thing |
| `evidence` | the one line of output that proves it |
| `fix-list` | `fair` (an agent may fix it), `hand` (the owner's hand: stage it, one tap), or `never` — per the lists (never / owner's hand / fair game) in `agents/ROUTING.md` §2 |
| `runbook` | a path or heading in your runbook, or `-` |

The wrapper collects the rows into `agents/state/senses.tsv`; the tick reads that file as its step 1, and the
morning brief quotes it. Rules for a sense: **read-only**, fast, no secrets in the output, no network calls you
would not make by hand, exit 0 (a non-zero exit is itself reported as a finding).

To add one: copy `disk-free.sh`, change the check, `chmod +x`. To disable one: remove its execute bit
(`chmod -x`). Two ship as examples: `disk-free.sh` and `failed-units.sh`.

**What to watch: one sense per thing you listed in `roadmap/home-setup.md`.** Pick from this table;
skip what you did not list. The `fix-list` default follows the thing's access word there (`manage` ->
`fair`, `ask` -> `hand`, `never` -> `never`); when unsure, use `hand`.

| If you listed | A sense that checks | Suggested severity |
|---|---|---|
| a NAS | its share is mounted and not an empty directory; free space | `crit` if the mount is gone, `warn` for space |
| a UPS | it reports on-line, not on battery (`upsc`, or its vendor tool) | `warn` on battery, `crit` when low |
| backups | the newest backup file is under N days old | `warn` |
| an always-on computer | `systemctl --failed`, disk, the clock | `warn` |
| a media server or any web app | its health URL answers 200 | `crit` |
| a domain or certificate | days until the certificate expires | `warn` at 21 days |
| containers or a cluster | `docker ps`, or `kubectl get pods -A` for anything not Running | `warn` |
| a smart-home hub | its API answers; no device `unavailable` for a day | `warn` |
| a router | the admin page or ping answers (a read, never a login) | `crit` |

Anything marked `never` in `home-setup.md` is not probed at all.

The tick runs only scripts that are committed and unchanged since HEAD; an untracked or edited sense is skipped with a finding row. Commit a sense yourself to enable it.
