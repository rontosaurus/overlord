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

**Examples of goals with a signal** (adapt, or add none; a tick with only G1 and G2 simply closes and fixes):

| Goal | Signal | Where measured |
|---|---|---|
| Backups are fresh and restorable. | the newest backup is under 7 days old; a restore test is under 90 days old | a `senses.d/` script that prints a row when not |
| The network is documented. | every device on the router's client list has a row in `home-setup.md` | the overlord's inventory report |
| Power loss is survivable. | the UPS reports on-line and a clean-shutdown test is under a year old | `upsc` output, a dated note |
| The media library stays tidy. | no duplicate titles; no folder the media server cannot match | the media server's own report |
| Fewer chores of mine. | the open list under "What annoys me" in `home-setup.md` shrinks month on month | that file's git history |

**Not goals (standing constraints, not targets):** the rules in `CLAUDE.md`, the locked decisions in the
roadmap, the action gates in `agents/ROUTING.md`. The governor cannot trade against these.

**How the tick uses this file:** a candidate action's rank = the lowest goal number it serves (G1 before G2 …)
× how many open rows it unblocks × oldest-half-finished first; a tie goes to the smaller blast. Anything
that serves no goal is parked, not opened.
