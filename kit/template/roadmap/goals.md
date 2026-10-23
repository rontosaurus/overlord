# Goals — what the governor works toward

*The roadmap holds decisions and specs; this file holds the targets. The tick (`agents/bin/tick`) ranks what
it closes, fixes, finishes and opens against these, in this order. A goal has a **signal** — something a
command or a file can answer — or it is a wish, and wishes go to `agents/state/ideas.md`. The owner sets
the goals; the framework never adds, edits or removes one. The strategist asks quarterly whether they
still hold.*

Goal ids are `G1`, `G2`, … — the strategist's priorities table must name one in its `why` column.

| # | Goal | Signal (what "on target" looks like) | Where it is measured |
|---|---|---|---|
| G1 | **Nothing stays broken for more than a day.** | *(example)* every service's health check is green; the senses in `agents/senses.d/` report nothing older than 24 h | `agents/state/senses.tsv`, the morning brief |
| G2 | **Nothing stays half-finished for more than 30 days without a named reason.** | every open initiative has an owner and a next physical step; none older than 30 days without a `why:`; no more open initiatives / asks than `wip_initiatives` / `ask_backpressure` in `ceiling.json` | `agents/state/overlord.md`, the arc's `DEAD` / `STALE` / `ORPHAN` alarms |
| G3 | **<your goal here>** | <a signal a command or file can answer> | <where> |

**Not goals (standing constraints, not targets):** the rules in `CLAUDE.md`, the locked decisions in the
roadmap, the action gates in `agents/ROUTING.md`. The governor cannot trade against these.

**How the tick uses this file:** a candidate action's rank = the lowest goal number it serves (G1 before G2 …)
× how many open rows it unblocks × oldest-half-finished first; a tie goes to the smaller blast. Anything
that serves no goal is parked, not opened.
