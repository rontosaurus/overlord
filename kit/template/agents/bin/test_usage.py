#!/usr/bin/env python3
"""Tests for agents/bin/usage against a fixture transcript tree. Run: python3 agents/bin/test_usage.py"""
import json, os, shutil, subprocess, sys, tempfile, unittest

USAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage")


def line(day, sid, mid, model, out):
    return json.dumps({"type": "assistant", "timestamp": day + "T10:00:00Z", "sessionId": sid, "version": "9.9",
                       "message": {"id": mid, "model": model, "usage": {
                           "input_tokens": 100, "output_tokens": out, "cache_read_input_tokens": 1000,
                           "cache_creation_input_tokens": 500,
                           "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 500}}}}) + "\n"


class UsageTests(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="usage-test-")
        cfg = os.path.join(self.d, "cfg", "projects")
        os.makedirs(os.path.join(cfg, "-w-wt-10-site", "s1", "subagents"))
        os.makedirs(os.path.join(cfg, "-w-main"))
        open(os.path.join(cfg, "-w-wt-10-site", "s1.jsonl"), "w").write(line("1999-12-31", "s1", "m1", "claude-sonnet-5", 2000) * 2)  # same id twice = one call
        open(os.path.join(cfg, "-w-wt-10-site", "s1", "subagents", "agent-a.jsonl"), "w").write(line("1999-12-31", "s1", "a1", "claude-haiku-4-5", 500))
        open(os.path.join(cfg, "-w-wt-10-site", "s1", "subagents", "agent-a.meta.json"), "w").write('{"agentType": "scout"}')
        open(os.path.join(cfg, "-w-main", "s2.jsonl"), "w").write(line("1999-12-31", "s2", "x1", "claude-unlisted-9", 10))
        self.env = dict(os.environ, CLAUDE_CONFIG_DIR=os.path.join(self.d, "cfg"), AGENTS_REPO=self.d, USAGE_STATE=os.path.join(self.d, "state"))

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def run_usage(self, *args):
        return subprocess.run([sys.executable, "-B", USAGE, *args], capture_output=True, text=True, env=self.env)

    def test_scan_classifies_and_prices(self):
        r = self.run_usage("scan")
        self.assertEqual(r.returncode, 0, r.stderr)
        rows = [l.split("\t") for l in open(os.path.join(self.d, "state", "usage.tsv")).read().splitlines()[1:]]
        by_model = {x[7]: x for x in rows}
        self.assertEqual(by_model["claude-sonnet-5"][4], "overseer")
        self.assertEqual(by_model["claude-sonnet-5"][5], "10-site")
        self.assertEqual(by_model["claude-sonnet-5"][9], "1")  # duplicated message id counted once
        self.assertEqual(by_model["claude-haiku-4-5"][4], "overseer/subagent")
        self.assertEqual(by_model["claude-haiku-4-5"][6], "scout")
        self.assertEqual(by_model["claude-unlisted-9"][18], "unknown-model")
        self.assertEqual(by_model["claude-unlisted-9"][4], "interactive")

    def test_scan_is_idempotent_and_keeps_pruned_rows(self):
        self.run_usage("scan")
        os.remove(os.path.join(self.d, "cfg", "projects", "-w-main", "s2.jsonl"))
        self.run_usage("scan")
        text = open(os.path.join(self.d, "state", "usage.tsv")).read()
        self.assertEqual(len(text.splitlines()), 4)  # header + 3 rows, the pruned transcript's row kept

    def test_report_and_session(self):
        self.run_usage("scan")
        self.assertIn("By role", self.run_usage("report").stdout)
        out = self.run_usage("session", "s1").stdout
        self.assertIn("1 subagents", out)
        self.assertIn("not a bill", out)

    def test_price_override_file(self):
        os.makedirs(os.path.join(self.d, "state"), exist_ok=True)
        json.dump({"models": {"claude-unlisted-9": {"input": 1, "cache_write_5m": 1, "cache_write_1h": 1, "cache_read": 1, "output": 1}}},
                  open(os.path.join(self.d, "state", "prices.json"), "w"))
        self.run_usage("scan")
        text = open(os.path.join(self.d, "state", "usage.tsv")).read()
        self.assertNotIn("unknown-model", text)


if __name__ == "__main__":
    unittest.main()
