# A three-day outage, start to finish

**A RECONSTRUCTION - rebuilt from the committed record, to show the shape of the work; names, times
and several details are changed or left out.** Host names here (`nas-one`, `media-box`, `hub-one`) are made up.

## What happened

A mains power event on day 1 took a NAS (`nas-one`) down and it did not come back. The
main app and the automation apps on `media-box` depended on its shares, so they failed quietly:
pages loaded, libraries looked empty, nothing shouted. The home hub (`hub-one`) just showed them
offline. Nobody noticed until day 3, when someone asked the overlord "is the main app
working?" Recovery came that day.

## Routing, and a slip

The right route for "something might be broken" is **incident, so on-call first**. The first look
was instead done by hand and cost about an hour of poking at the wrong layer. That is written up as a
routing slip, not a disaster: the framework's rule already said where to go.

On-call then returned a diagnosis. An excerpt, written for this example:

> **Symptom.** The main app answers; every library shows zero items. Two dependent apps report
> their storage paths missing.
> **Timeline.** Power event on day 1; last successful scan that afternoon; first empty scan
> an hour after.
> **Diagnosis (confidence: high).** Its network mounts on `media-box` point at `nas-one`, which
> is unreachable. The UPS log shows the mains event and a clean shutdown.
> **Recommended action (owner's hand).** Power `nas-one` on through its remote power control (or the power
> button). Attended.
> **What I ruled out.** Disk full on `media-box`; expired credentials; network switch fault; the
> main app's own data.

## The stakeholder-impact verdict, and a catch

Before containment, the stakeholder-impact specialist was asked who would notice. Its verdict
reported an approval as already given when the request had only been *made*. The overlord read the
verdict against its own rules (a verdict must state approval status exactly as recorded) and sent it
back. The second version was right. Lesson: a reviewer's output is checked against the rules, not
trusted because it sounds sure.

## Containment (fair game)

To stop the two apps from reacting to "missing" folders, for example by marking items absent or
trying to delete them, both were **scaled to zero**. That is reversible and was recorded in the
report, with the exact command to scale them back.

## The irreversible step was staged, not done

Powering on `nas-one` is host power, on the owner's-hand list, so the framework **never did it**.
It went into the overlord's asks as a numbered item with the steps. The owner did it, attended.

## Recovery

1. Power on through its remote power control (or the power button); watch it boot.
2. Bring the NAS back fully: wait for its storage to come up and its shares to be served.
3. Re-mount its shares on `media-box` (by address, since the name no longer resolved).
4. Restart the dependent apps; scale the two contained apps back up.
5. Trigger rescans and confirm counts match the pre-outage numbers.

## A worker that stopped

After recovery, a worker tried to confirm a check that one of the apps depended on. The check was
blocked: an external API it depended on was unavailable.
The worker did **not** retry or hunt for a way around. It verified what it could reach by another
route, reported the blocker, and stopped. A report
that says "blocked, here is why, here is what I did verify" is a good report.

## Asks raised for the owner

- Make `nas-one` restart on its own after a power loss.
- Add a monitoring check on the share, so the next outage is noticed in minutes, not days.

## Notes to the overmind

One was a **coverage miss**: the alarm that should have caught the outage had been built outside the
framework, so it was never reviewed and never tested by deliberately breaking it. The fix was a
session-start line that reminds the overlord to route incidents to on-call first.

## What the framework could not do: it had no senses

It cannot notice an outage by itself. It only acts when someone asks. Detection was the human's
("is the main app working?"). The owner's answer is a separate piece of work, a "senses" layer
that watches and raises its hand, kept apart from the delegating framework on purpose.
