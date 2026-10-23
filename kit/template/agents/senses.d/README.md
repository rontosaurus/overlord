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
(`chmod -x`). Ideas: a service health URL, a backup's age, `systemctl --failed`, a cert's days-to-expiry,
the container or cluster state you run (`kubectl get pods -A`, `docker ps`), a mount that must exist.

The tick runs only scripts that are committed and unchanged since HEAD; an untracked or edited sense is skipped with a finding row. Commit a sense yourself to enable it.
