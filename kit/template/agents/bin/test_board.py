#!/usr/bin/env python3
"""Tests for agents/bin/board. Run: python3 agents/bin/test_board.py   (standard library only)"""
import datetime as dt, importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest, unittest.mock

HERE = os.path.dirname(os.path.abspath(__file__))
BOARD = os.path.join(HERE, "board")
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("board_mod", BOARD)
board = importlib.util.module_from_spec(importlib.util.spec_from_loader("board_mod", loader))
loader.exec_module(board)
NOW = dt.datetime(1999, 12, 31, 10, 0)

OVERLORD = """# Overlord state

## Open initiatives

| Id | Goal | Brief | Branch | Status | Opened |
|---|---|---|---|---|---|
| 10-site | build the site | | init/10-site | running tests | 1999-12-31 08:00 |
| 20-docs | write docs | | init/20-docs | **Owner next:** pick a title | 1999-12-20 |
| 30-leak | x | | | api_key = abcdefghijklmnop1234 | 1999-12-30 |

## Ask the owner (queue)

| # | Action staged | Why | Staged where | Go (who / when) | Opened |
|---|---|---|---|---|---|
| 1 | restart the thing | it hung | a report | | 1999-12-30 |
| 2 | old ask | x | y | you / yesterday | 1999-12-01 |

## Recently closed

| Id | Outcome | Attestations verified | Closed |
|---|---|---|---|
| 05-setup | done | yes | 1999-12-29 |

## Last wake

`1999-12-31 06:00` - noop
"""


def write_file(path, body):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body)


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def make_repo(files):
    d = tempfile.mkdtemp(prefix="board-test-")
    st = os.path.join(d, "agents", "state")
    os.makedirs(st)
    for rel, body in files.items():
        p = os.path.join(st, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        write_file(p, body)
    return d


class BoardTests(unittest.TestCase):
    def setUp(self):
        self.dirs = []

    def tearDown(self):
        for d in self.dirs:
            shutil.rmtree(d, ignore_errors=True)

    def repo(self, files):
        d = make_repo(files)
        self.dirs.append(d)
        return d

    def test_missing_everything_renders_with_a_banner(self):
        d = self.repo({})
        model, files = board.build(d, NOW)
        self.assertEqual([e["section"] for e in model["errors"]], ["overlord.md"])
        self.assertEqual(model["cards"], [])
        self.assertIn("overlord board", board.render_html(model))

    def test_template_state_is_clean(self):
        template = os.path.normpath(os.path.join(HERE, "..", ".."))
        model, _ = board.build(template, NOW)
        self.assertEqual(model["errors"], [])
        self.assertEqual(model["asks_open"], 0)

    def test_populated_state(self):
        d = self.repo({
            "overlord.md": OVERLORD,
            "next.md": "updated 1999-12-31 06:00 UTC\n- now · ship the site\n- on deck · docs\n- week · unset\n",
            "threads.md": "| thread | waiting on | since | how to check | tag |\n|---|---|---|---|---|\n| renewal | the registrar | 12-01 | look | owner |\n",
            "priorities.md": "| # | slot | what | why | next (who) | since | source |\n|---|---|---|---|---|---|---|\n| 1 | reply | pick | why | reply | 1 | ask #1 |\n| 2 | bogus | x | y | z | 1 | s |\n",
            "costs.tsv": "ts\tid\tmodel\tturns\tcost_usd\tduration_s\tsubtype\torigin\n1999-12-31T05:00:00\ttick\topus\t5\t1.5\t60\tsuccess\tunattended\n",
            "ceiling.json": json.dumps({"daily_usd": 1, "daily_turns": 10, "tick_mode": "propose", "wip_initiatives": 5, "ask_backpressure": 4}),
            "activity.tsv": "ts\twho\tinitiative\twhat\tundo\tproof\n1999-12-31T09:30:00\toverseer\t10-site\tdid a thing\tundo it\t-\n",
            "reports/10-site-20000101-0900.md": "body\n",
        })
        model, files = board.build(d, NOW)
        self.assertEqual(model["asks_open"], 1)
        self.assertEqual(model["triage"]["counts"], {"waiting": 2, "in_flight": 2, "idle": 1})
        self.assertEqual(model["strategist"]["next"]["now"], "ship the site")
        self.assertEqual(model["strategist"]["threads"][0]["tag"], "owner")
        self.assertEqual(len(model["strategist"]["priorities"]), 1)
        self.assertEqual(model["ceiling"]["spent"], True)
        self.assertEqual(model["tick"]["subtype"], "success")
        self.assertEqual(model["limits"]["wip_initiatives"], 5)
        self.assertEqual([c["id"] for c in model["cards"] if c["col"] == "autonomous"], ["act:2"])
        self.assertIn("files/reports/10-site-20000101-0900.md", files)
        self.assertTrue(any(e["section"] == "priorities.md" for e in model["errors"]))

    def test_secret_shaped_text_is_withheld(self):
        d = self.repo({"overlord.md": OVERLORD, "reports/30-leak-20000101-0900.md": "password = hunter2hunter2hunter2\n"})
        model, files = board.build(d, NOW)
        leak = next(c for c in model["cards"] if c["id"] == "30-leak" and c["col"] == "open")
        self.assertEqual(leak["status"], board.WITHHELD)
        self.assertEqual(files, {})
        self.assertNotIn("abcdefghijklmnop1234", json.dumps(model))

    def test_symlinked_report_is_not_published(self):
        d = self.repo({"overlord.md": OVERLORD})
        os.makedirs(os.path.join(d, "agents/state/reports"))
        target = os.path.join(d, "outside.md")
        write_file(target, "outside\n")
        try:
            os.symlink(target, os.path.join(d, "agents/state/reports/10-site-20000101-0900.md"))
        except (OSError, NotImplementedError):
            self.skipTest("no symlinks here")
        _, files = board.build(d, NOW)
        self.assertEqual(files, {})

    def test_band_has_four_lines_and_never_raises(self):
        d = self.repo({"overlord.md": OVERLORD})
        lines = board.band(d, NOW)
        self.assertEqual([l.split(" · ")[0] for l in lines], ["now", "asks", "ran", "tick"])
        self.assertEqual(len(board.band(os.path.join(d, "nope"), NOW)), 4)

    def test_cli_writes_page_and_refuses_a_foreign_directory(self):
        d = self.repo({"overlord.md": OVERLORD})
        out = os.path.join(d, "out")
        r = subprocess.run([sys.executable, "-B", BOARD, "--repo", d, "--out", out, "--now", "1999-12-31T10:00:00"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.exists(os.path.join(out, "index.html")))
        self.assertEqual(read_json(os.path.join(out, "board.json"))["asks_open"], 1)
        foreign = os.path.join(d, "foreign")
        os.makedirs(foreign)
        write_file(os.path.join(foreign, "keep.txt"), "x")
        r = subprocess.run([sys.executable, "-B", BOARD, "--repo", d, "--out", foreign], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertTrue(os.path.exists(os.path.join(foreign, "keep.txt")))

    def test_scrub_strips_control_characters_from_every_string(self):
        out = board.scrub({"a": ["x\x1b[2Jy", {"b": "p\x07q\u200bz"}], "_k": "kept"})
        self.assertEqual(out["a"][0], "x [2Jy")
        self.assertEqual(out["a"][1]["b"], "p qz")

    def test_symlinked_ceiling_and_costs_are_not_followed(self):
        d = self.repo({"overlord.md": OVERLORD})
        st = os.path.join(d, "agents/state")
        victim = os.path.join(d, "victim.json")
        write_file(victim, json.dumps({"daily_usd": 99, "tick_mode": "act"}))
        try:
            os.symlink(victim, os.path.join(st, "ceiling.json"))
        except (OSError, NotImplementedError):
            self.skipTest("no symlinks here")
        model, _ = board.build(d, NOW)
        self.assertIsNone(model["ceiling"])

    def test_implicit_out_dir_outside_the_repo_is_refused(self):
        d = self.repo({"overlord.md": OVERLORD})
        elsewhere = tempfile.mkdtemp(prefix="board-elsewhere-")
        self.addCleanup(shutil.rmtree, elsewhere, True)
        try:
            os.symlink(elsewhere, os.path.join(d, "agents/state/board"))
        except (OSError, NotImplementedError):
            self.skipTest("no symlinks here")
        r = subprocess.run([sys.executable, "-B", BOARD, "--repo", d, "--now", "1999-12-31T10:00:00"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertEqual(os.listdir(elsewhere), [])
        r = subprocess.run([sys.executable, "-B", BOARD, "--repo", d, "--out", os.path.join(elsewhere, "o"), "--now", "1999-12-31T10:00:00"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


def stamp(minutes_ago=0, seconds_ago=0):
    """A drift.log timestamp that many minutes / seconds before NOW (negative = in the future), with a UTC offset like `date -Is`."""
    return (NOW - dt.timedelta(minutes=minutes_ago, seconds=seconds_ago)).strftime("%Y-%m-%dT%H:%M:%S") + "-05:00"


def drift_line(ts, kind, msg="interactive: [matched: x]", init="-"):
    return "%s | %s | %s | %s\n" % (ts, kind, init, msg)


NOTES = """# Notes to overmind

Each review ends with a marker line such as `<!-- overmind review YYYY-MM-DD -->` (this prose line does not count).
- 1999-12-01 (overlord/10-site) - an older note
<!-- overmind review 1999-12-10 -->
- 1999-12-12 (overlord/10-site) - a newer note
<!-- overmind review 1999-12-20 -->
- 1999-12-25 (overlord/20-docs) - after the last review
"""


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.dirs = []

    def tearDown(self):
        for d in self.dirs:
            shutil.rmtree(d, ignore_errors=True)

    def repo(self, files):
        d = make_repo(files)
        self.dirs.append(d)
        return d

    def test_marker_found_counts_debriefs_and_days_since_the_last_marker(self):
        d = self.repo({
            "notes-to-overmind.md": NOTES,
            "debriefs/1999-12-09-overlord-aaaaaaaa.md": "before every marker\n",
            "debriefs/1999-12-19-overlord-bbbbbbbb.md": "the day before the last marker\n",
            "debriefs/1999-12-20-overmind-cccccccc.md": "the marker day counts\n",
            "debriefs/1999-12-28-overlord-dddddddd.md": "after\n",
            "debriefs/notes.txt": "not a debrief\n",
            "drift.log": "",
        })
        model, _ = board.build(d, NOW)
        rv = model["review"]
        self.assertEqual((rv["last_review"], rv["days_since"], rv["debriefs_since"]), ("1999-12-20", 11, 2))
        self.assertEqual(rv["drift_since"], {})
        self.assertEqual(sorted(rv), ["days_since", "debriefs_since", "drift_since", "last_review"])

    def test_a_marker_in_prose_or_with_an_impossible_date_is_not_the_marker(self):
        d = self.repo({"notes-to-overmind.md": "see `<!-- overmind review 1999-12-18 -->` in the docs\n<!-- overmind review 1999-12-10 -->\n<!-- overmind review 1999-13-45 -->\n"})
        model, _ = board.build(d, NOW)
        self.assertEqual(model["review"]["last_review"], "1999-12-10")
        self.assertEqual(model["review"]["days_since"], 21)

    def test_marker_absent_gives_null_fields_not_zeros(self):
        d = self.repo({"notes-to-overmind.md": "# Notes\n- 1999-12-01 (overlord/x) - a note, no review yet\n", "drift.log": drift_line(stamp(60), "hook-block:H4")})
        model, _ = board.build(d, NOW)
        self.assertEqual(model["review"], {"last_review": None, "days_since": None, "debriefs_since": None, "drift_since": None})
        self.assertEqual(model["alarms"], {"recent_denies": 0})
        self.assertIn("no review marker yet", board.render_html(model))

    def test_no_debriefs_folder_is_null_and_a_symlinked_one_is_not_followed(self):
        d = self.repo({"notes-to-overmind.md": NOTES})
        model, _ = board.build(d, NOW)
        self.assertIsNone(model["review"]["debriefs_since"])
        self.assertIsNone(model["review"]["drift_since"])
        elsewhere = tempfile.mkdtemp(prefix="board-debriefs-")
        self.addCleanup(shutil.rmtree, elsewhere, True)
        write_file(os.path.join(elsewhere, "1999-12-28-overlord-eeeeeeee.md"), "x\n")
        try:
            os.symlink(elsewhere, os.path.join(d, "agents/state/debriefs"))
        except (OSError, NotImplementedError):
            self.skipTest("no symlinks here")
        model, _ = board.build(d, NOW)
        self.assertIsNone(model["review"]["debriefs_since"])

    def test_debrief_without_a_date_prefix_is_dated_by_its_modified_time(self):
        d = self.repo({"notes-to-overmind.md": NOTES, "debriefs/undated.md": "x\n"})
        old = dt.datetime(1999, 12, 15).timestamp()
        os.utime(os.path.join(d, "agents/state/debriefs/undated.md"), (old, old))
        self.assertEqual(board.build(d, NOW)[0]["review"]["debriefs_since"], 0)
        new = dt.datetime(1999, 12, 29).timestamp()
        os.utime(os.path.join(d, "agents/state/debriefs/undated.md"), (new, new))
        self.assertEqual(board.build(d, NOW)[0]["review"]["debriefs_since"], 1)

    def test_drift_lines_since_the_marker_are_counted_by_kind(self):
        log = "".join([
            drift_line("1999-12-19T23:59:59-05:00", "hook-block:H4"),            # before the marker day: not counted
            drift_line("1999-12-20T00:00:00-05:00", "hook-block:H4"),
            drift_line("1999-12-22T10:00:00-05:00", "hook-block:H2"),
            drift_line("1999-12-22T11:00:00-05:00", "hook-ask:H4"),
            drift_line("1999-12-23T11:00:00-05:00", "classifier-deny", "worker: restart x - denied"),
            drift_line("1999-12-24T11:00:00-05:00", "waived-F", "waived by the owner | with a pipe in the text"),
            drift_line("1999-12-24T12:00:00-05:00", "routing-bypass"),
            drift_line("1999-12-24T13:00:00-05:00", "something-new"),             # unknown kinds count as other
            "not a drift line\n",
            "1999-12-24T14:00:00-05:00 | hook-block:H4\n",     # two fields: not a drift line
            "garbage-time | hook-block:H4 | - | x\n",
        ])
        d = self.repo({"notes-to-overmind.md": NOTES, "drift.log": log})
        rv = board.build(d, NOW)[0]["review"]
        self.assertEqual(rv["drift_since"], {"classifier-deny": 1, "hook-ask": 1, "hook-block": 2, "other": 1, "routing-bypass": 1, "waived-F": 1})
        self.assertNotIn("pipe in the text", json.dumps(rv))     # counts only, never message text

    def test_recent_denies_counts_attended_blocks_and_classifier_denials_in_the_last_15_minutes(self):
        log = "".join([
            drift_line(stamp(0, 30), "hook-block:H4", "interactive: [rm x]"),                # counted
            drift_line(stamp(14, 59), "hook-block:H1", "interactive/worker: [y]"),            # counted: a subagent of an attended session
            drift_line(stamp(5), "classifier-deny", "worker: restart x - denied"),            # counted: only an attended session has a classifier
            drift_line(stamp(15, 1), "hook-block:H4", "interactive: [old]"),                  # just outside the window
            drift_line(stamp(-1), "hook-block:H4", "interactive: [future]"),                  # in the future: not now
            drift_line(stamp(2), "hook-block:H4", "overseer: [unattended run]"),              # unattended: not an attended deny
            drift_line(stamp(2), "hook-ask:H4", "interactive: [a prompt the owner answered]"),  # an ask is not a deny
            drift_line(stamp(2), "waived-F", "interactive: [waiver]"),
        ])
        d = self.repo({"drift.log": log})
        model, _ = board.build(d, NOW)
        self.assertEqual(model["alarms"], {"recent_denies": 3})
        self.assertIsNone(model["review"])     # no notes file: no review block

    def test_a_log_longer_than_the_old_head_cap_is_read_from_its_tail(self):
        d = self.repo({"notes-to-overmind.md": NOTES})
        path = os.path.join(d, "agents/state/drift.log")
        recent = drift_line(stamp(1), "hook-block:H4") + drift_line(stamp(2), "classifier-deny", "worker: x")
        with open(path, "wb") as fh:
            fh.seek(board.BIG + (4 << 20))      # a hole that reads back as NUL bytes, ahead of the only real lines
            fh.write(b"\n" + recent.encode())
        self.assertGreater(os.path.getsize(path), board.BIG)
        model, _ = board.build(d, NOW)
        self.assertEqual(model["alarms"], {"recent_denies": 2})
        self.assertIsNone(model["review"]["drift_since"])      # the window starts after the marker: the count would be partial
        self.assertIn("drift since: not available", board.render_html(model))

    def test_read_tail_drops_the_partial_first_line_and_says_when_it_clipped(self):
        d = self.repo({})
        path = os.path.join(d, "agents/state/t.log")
        write_file(path, "aaa\nbbb\nccc\n")
        self.assertEqual(board.read_tail(path, 6), ("ccc\n", True))
        self.assertEqual(board.read_tail(path, 12), ("aaa\nbbb\nccc\n", False))
        self.assertEqual(board.read_tail(path, 100), ("aaa\nbbb\nccc\n", False))
        self.assertEqual(board.read_tail(path, 3), ("", True))     # inside one line: nothing whole to keep
        self.assertIsNone(board.read_tail(os.path.join(d, "agents/state/missing.log"), 10))
        self.assertIsNone(board.read_tail(os.path.join(d, "agents/state"), 10))

    def test_the_tail_window_counts_drift_exactly_only_when_it_reaches_the_marker(self):
        old = drift_line("1999-12-12T10:00:00-05:00", "hook-ask:H4")
        tail = [drift_line("1999-12-25T10:00:00-05:00", "waived-F"), drift_line("1999-12-26T10:00:00-05:00", "waived-F"), drift_line(stamp(1), "hook-block:H4")]
        d = self.repo({"notes-to-overmind.md": NOTES, "drift.log": old * 200 + "".join(tail)})
        tail_len = sum(len(l) for l in tail)
        with unittest.mock.patch.object(board, "DRIFT_TAIL", tail_len + 10 * len(old) + 5):     # the three tail lines and ten older ones
            model, _ = board.build(d, NOW)
        self.assertEqual(model["review"]["drift_since"], {"hook-block": 1, "waived-F": 2})
        self.assertEqual(model["alarms"], {"recent_denies": 1})
        with unittest.mock.patch.object(board, "DRIFT_TAIL", tail_len + 5):                    # the three tail lines only
            model, _ = board.build(d, NOW)
        self.assertIsNone(model["review"]["drift_since"])
        self.assertEqual(model["alarms"], {"recent_denies": 1})

    def test_a_symlinked_drift_log_is_not_followed(self):
        d = self.repo({"notes-to-overmind.md": NOTES})
        target = os.path.join(d, "elsewhere.log")
        write_file(target, drift_line(stamp(1), "hook-block:H4"))
        try:
            os.symlink(target, os.path.join(d, "agents/state/drift.log"))
        except (OSError, NotImplementedError):
            self.skipTest("no symlinks here")
        model, _ = board.build(d, NOW)
        self.assertIsNone(model["alarms"])
        self.assertIsNone(model["review"]["drift_since"])

    def test_new_keys_are_null_when_their_source_files_are_absent(self):
        d = self.repo({"overlord.md": OVERLORD})
        model, _ = board.build(d, NOW)
        self.assertIsNone(model["review"])
        self.assertIsNone(model["alarms"])
        page = board.render_html(model)
        self.assertNotIn("guard deny", page)
        self.assertNotIn("<h2>Review", page)
        self.assertEqual(len(board.band(d, NOW)), 4)

    def test_page_draws_the_review_card_and_the_alarm_only_when_there_is_something_to_say(self):
        log = drift_line(stamp(1), "hook-block:H4") + drift_line("1999-12-22T10:00:00-05:00", "classifier-deny", "worker: x")
        d = self.repo({"overlord.md": OVERLORD, "notes-to-overmind.md": NOTES, "debriefs/1999-12-28-overlord-ffffffff.md": "x\n", "drift.log": log})
        page = board.render_html(board.build(d, NOW)[0])
        self.assertIn("1 guard deny(s) on attended sessions in the last 15 min", page)
        self.assertIn("see state/drift.log", page)
        self.assertIn("last review 1999-12-20", page)
        self.assertIn("11 days ago", page)
        self.assertIn("1 debrief since", page)
        self.assertIn("classifier-deny 1", page)
        quiet = self.repo({"overlord.md": OVERLORD, "notes-to-overmind.md": NOTES, "drift.log": drift_line(stamp(30), "hook-block:H4")})
        self.assertNotIn("guard deny", board.render_html(board.build(quiet, NOW)[0]))

    def test_cli_json_carries_the_new_keys(self):
        d = self.repo({"overlord.md": OVERLORD, "notes-to-overmind.md": NOTES, "drift.log": drift_line(stamp(1), "hook-block:H4")})
        out = os.path.join(d, "out")
        r = subprocess.run([sys.executable, "-B", BOARD, "--repo", d, "--out", out, "--now", "1999-12-31T10:00:00"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        m = read_json(os.path.join(out, "board.json"))
        self.assertEqual(m["alarms"], {"recent_denies": 1})
        self.assertEqual(m["review"]["last_review"], "1999-12-20")


if __name__ == "__main__":
    unittest.main()
