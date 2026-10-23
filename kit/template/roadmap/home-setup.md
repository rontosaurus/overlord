# My home setup

*What the framework may see and what it may change. The overlord fills this in with you in its first
session and reads it on every wake. Edit it any time; a row you delete is a thing the agents stop
assuming exists. No passwords, keys or Wi-Fi passphrases here, ever: name where a secret lives, never
the secret.*

**Access** is one of four words, and each maps onto the two lists in `agents/ROUTING.md` §2:

| Access | Means | List |
|---|---|---|
| `read` | Agents may look: status pages, logs, inventories, health checks. No changes. | fair game (reads) |
| `manage` | Agents may also make reversible changes (restart, update a setting, add a scheduled job) under the three habits: look first, record the undo, log it. | fair game |
| `ask` | Agents prepare the exact change and stop; you approve or run it. | owner's hand |
| `never` | Agents do not touch it, and say so if a task would need it. | never |

## What I have

Some examples of what people put here; keep the ones you have, delete the rest, add your own:

| Thing | Make / model | Where it is, how it is reached | Access | Notes |
|---|---|---|---|---|
| Router / firewall | | admin page address, or "app only" | `read` | changing it is usually `ask` |
| Wi-Fi access points / mesh | | | `read` | |
| NAS (network storage) | | | `read` | photos, documents, backups live here? anything irreplaceable is never deleted by an agent |
| UPS (battery backup) | | USB to which machine, or network card | `read` | does it shut machines down cleanly? |
| Smart-home hub | | | `read` | lights, locks, thermostat: locks and alarms are usually `never` |
| Always-on computer (mini PC, server, Raspberry Pi) | | | `manage` | where scheduled jobs would run |
| Media server | | | `manage` | who else watches; avoid restarts while someone is |
| Cameras / doorbell | | | `never` | |
| Printer / scanner | | | `read` | |
| Backups (local or cloud) | | | `read` | when did a restore last get tested? |
| Domain names / DNS provider | | | `ask` | anything internet-facing is `ask` |
| Password manager | | | `never` | agents may use a scoped command-line token only if you set one up (`agents/estate.env`) |
| My own computer | | | `read` | |

## What annoys me

Things that break, nag, or need remembering. These become the first initiatives.

-

## What is always on

Which of the above stays powered all the time. Anything unattended can only run on these.

-
