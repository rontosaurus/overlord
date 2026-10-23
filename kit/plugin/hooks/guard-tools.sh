#!/usr/bin/env bash
# PreToolUse hook (matcher: mcp__.*|WebFetch) - gate H1 for tools that can send things.
# stdin: hook JSON. Greps the WHOLE JSON text (case-insensitive) against H1_PATTERNS.
# Exit 2 + stderr = deliberate block. Every error of this script's own exits 0 (allow).
# Inert unless AGENTS_REPO (or, if unset, the session's project dir) contains agents/estate.env.
# agents/guard.conf is PARSED line by line, never executed or sourced: only H1_PATTERNS is read,
# one pair of surrounding quotes is stripped, everything else is ignored.
# AGENTS_REPO (the owner named it) wins. Else the session's project dir - read-only use then:
# its config is still parsed (it can only add blocks), but nothing in it is executed or written.
REPO="${AGENTS_REPO:-}"; OWN=1
[ -n "$REPO" ] || { REPO="${CLAUDE_PROJECT_DIR:-}"; OWN=0; }
[ -n "$REPO" ] && [ -f "$REPO/agents/estate.env" ] || exit 0

H1_PATTERNS=""
conf="$REPO/agents/guard.conf"
if [ -f "$conf" ]; then
  while IFS='=' read -r k v || [ -n "$k" ]; do
    k="${k//[[:space:]]/}"; v="${v%$'\r'}"
    case "$k" in ''|'#'*) continue ;; esac
    v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
    case "$v" in
      \'*\') [ "${#v}" -ge 2 ] && v="${v:1:${#v}-2}" ;;
      \"*\") [ "${#v}" -ge 2 ] && v="${v:1:${#v}-2}" ;;
    esac
    [ "$k" = H1_PATTERNS ] && H1_PATTERNS="$v"
  done < "$conf" 2>/dev/null
fi
[ -n "$H1_PATTERNS" ] || exit 0

in="$(cat 2>/dev/null)" || exit 0
[ -z "$in" ] && exit 0
role="${AGENT_ROLE:-interactive}"
init="${AGENT_INITIATIVE:--}"
if printf '%s' "$in" | grep -Eiq -- "$H1_PATTERNS" 2>/dev/null; then
  printf 'BLOCKED by gate H1: this tool call names a target on the never-send list (agents/guard.conf). Nothing leaves the owner'"'"'s own devices and accounts without explicit permission for that specific message.\n' >&2
  DRIFT="$REPO/agents/bin/drift"
  if [ "$OWN" = 1 ] && [ "${AGENT_EVAL:-0}" != 1 ] && [ -x "$DRIFT" ] && [ ! -L "$REPO/agents/state" ]; then
    "$DRIFT" "hook-block:H1" "$init" "$role: [tool call names a never-send target]" >/dev/null 2>&1
  fi
  exit 2
fi
exit 0
