#!/usr/bin/env bash
# SessionEnd hook - remove this session's registration. Inert without agents/estate.env in AGENTS_REPO (or the project dir).
# Reads no config values; estate.env is only checked for existence (never executed).
# AGENTS_REPO (the owner named it) wins. Else the session's project dir - read-only use then:
# its config is still parsed (it can only add blocks), but nothing in it is executed or written.
REPO="${AGENTS_REPO:-}"; OWN=1
[ -n "$REPO" ] || { REPO="${CLAUDE_PROJECT_DIR:-}"; OWN=0; }
[ -n "$REPO" ] && [ -f "$REPO/agents/estate.env" ] || exit 0
[ "$OWN" = 1 ] || exit 0
# never follow a symlinked state dir (a cloned repo could point it at another folder)
[ -L "$REPO/agents/state" ] || [ -L "$REPO/agents/state/sessions" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
sid="$(jq -r '.session_id // empty' 2>/dev/null)"
case "$sid" in ''|*[!A-Za-z0-9-]*) exit 0 ;; esac
rm -f "$REPO/agents/state/sessions/$sid.json" 2>/dev/null
exit 0
