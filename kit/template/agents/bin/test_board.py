#!/usr/bin/env python3
"""Tests for agents/bin/board. Run: python3 agents/bin/test_board.py   (standard library only)"""
import datetime as dt, importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest

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


def make_repo(files):
    d = tempfile.mkdtemp(prefix="board-test-")
    st = os.path.join(d, "agents", "state")
    os.makedirs(st)
    for rel, body in files.items():
        p = os.path.join(st, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w", encoding="utf-8").write(body)
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
        self.assertIn("work board", board.render_html(model))

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
        self.assertEqual(model["triage"]["counts"], {"waiting": 2, "inflight": 2, "idle": 1})
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
        open(target, "w").write("outside\n")
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
        self.assertEqual(json.load(open(os.path.join(out, "board.json")))["asks_open"], 1)
        foreign = os.path.join(d, "foreign")
        os.makedirs(foreign)
        open(os.path.join(foreign, "keep.txt"), "w").write("x")
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
        open(victim, "w").write(json.dumps({"daily_usd": 99, "tick_mode": "act"}))
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


if __name__ == "__main__":
    unittest.main()
