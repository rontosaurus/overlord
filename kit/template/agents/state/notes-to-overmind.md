# Notes to overmind

An **append-only** channel from the overlord (and anyone who notices a gap in the framework) to the
maintainer session. Add lines with `agents/bin/note-to-overmind "<message>"`; never edit or delete an
earlier line. Each line: `- date (role/initiative) — message`.

**Review-marker convention.** When a review finishes, it appends one line:

`<!-- overmind review YYYY-MM-DD -->`

The next review reads only what follows the last marker. The first review reads everything. An empty
file is fine.
