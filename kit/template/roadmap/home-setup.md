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

An access word can only make things stricter than the shipped lists, never looser: a router marked
`manage` still asks you before a firewall change, because that shape is on the owner's-hand list. If
unsure, pick the stricter word.

## What I have

Some examples of what people put here; keep the ones you have, delete the rest, add your own. The
**Access** column is a suggested default; change it freely:

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
| Domain names / DNS provider | | | `ask` | anything internet-facing is `ask`; put the provider's API host in `H4_PROVIDER_HOSTS` yourself (`guard.conf`) |
| Password manager | | where secrets live (name only) | `never` | agents may use a scoped command-line token only if you set one up (`SECRET_CLI` in `agents/estate.env`) |
| My own computer | | | `read` | |

## Who depends on it

People who would notice if something here broke or restarted, and what each one uses.
The impact reviewer reads this. Examples, and delete what is not true:

| Who | What they use | Notice first |
|---|---|---|
| Me | everything | |
| Partner | Wi-Fi, the smart lights, the media server in the evening | the TV buffering, a light that won't turn on |
| Kids | Wi-Fi for school, a shared tablet | homework offline |
| Housemate / parent | the printer, their own phone on the Wi-Fi | "the internet is down" |

*Suggested default if you live alone: one row, "Me".*

## Quiet hours

When nothing noisy or restarting should happen, and when heavy jobs (backups, library scans, big
downloads) may run. Examples: `22:00-07:00 every night, nothing restarts`; `18:00-23:00 when someone is
watching TV, no media-server restarts`; `weekdays 09:00-17:00 I'm on calls, no Wi-Fi changes`.
*Suggested default: `22:00-07:00` quiet; heavy jobs `02:00-05:00`.*

-

## Things I would hate to lose

Where the only copy of something lives. Agents never delete these, in any mode. The folder paths belong
in `H4_NEVER_PATHS` in `agents/guard.conf` (setup step 3 asked; copy those here rather than answering
twice). Examples: the photo library, scanned documents, tax and finance records, family videos, the
export of a game save. For each, say whether a backup exists. *Suggested default: everything that
exists in only one place.*

-

## What annoys me

Things that break, nag, or need remembering. These become the first initiatives. Examples: "the Wi-Fi
drops in the back bedroom", "I never know if the backup ran", "the NAS beeps and I don't know why",
"I forget to renew the domain", "the media library has duplicates". *Suggested default: pick one or two;
a read-only inventory is always a fine first initiative.*

-

## What is always on

Which of the above stays powered all the time. Anything unattended can only run on these, so a machine
that sleeps or gets switched off (a desktop that sleeps, a laptop) is not on this list. Examples: "the mini PC in
the cupboard", "the NAS", "the Raspberry Pi". *Suggested default: nothing; a scheduled loop (see
`kit/WALKTHROUGH.md` § Later) waits until you have an always-on machine.*

-
