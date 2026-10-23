#!/usr/bin/env bash
# SessionStart hook - register this session and print framework context for the model.
# Inert unless AGENTS_REPO (or, if unset, the session's project dir) contains agents/estate.env. Never exits non-zero.
# Config files are never sourced or executed; estate.env is only checked for existence here.
# AGENTS_REPO (the owner named it) wins. Else the session's project dir - read-only use then:
# its config is still parsed (it can only add blocks), but nothing in it is executed or written.
REPO="${AGENTS_REPO:-}"; OWN=1
[ -n "$REPO" ] || { REPO="${CLAUDE_PROJECT_DIR:-}"; OWN=0; }
[ -n "$REPO" ] && [ -f "$REPO/agents/estate.env" ] || exit 0
if ! command -v jq >/dev/null 2>&1; then
  echo "hatchery: jq not found - the gates are OFF"
  exit 0
fi
if [ "$OWN" != 1 ]; then  # project-dir fallback: say so, register nothing, read no state
  echo "## Agent framework - hook gates are active on Bash (rules from this folder's agents/; AGENTS_REPO is not set)."
  exit 0
fi
# never follow a symlinked state dir (a cloned repo could point it at another folder)
[ -L "$REPO/agents/state" ] || [ -L "$REPO/agents/state/sessions" ] && exit 0
REG="$REPO/agents/state/sessions"
mkdir -p "$REG" 2>/dev/null || exit 0
in="$(cat 2>/dev/null)"
sid="$(printf '%s' "$in" | jq -r '.session_id // empty' 2>/dev/null)"
cwd="$(printf '%s' "$in" | jq -r '.cwd // empty' 2>/dev/null)"
src="$(printf '%s' "$in" | jq -r '.source // "startup"' 2>/dev/null)"
role="${AGENT_ROLE:-interactive}"
init="${AGENT_INITIATIVE:--}"
# find the claude process above us
pid=$PPID; cpid=""
for _ in 1 2 3 4 5 6; do
  [ "${pid:-0}" -le 1 ] 2>/dev/null && break
  if tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null | grep -q 'claude'; then cpid=$pid; break; fi
  pid=$(awk '{print $4}' /proc/$pid/stat 2>/dev/null || echo 1)
  [ -n "$pid" ] || pid=1
done
# prune dead registrations
for f in "$REG"/*.json; do
  [ -e "$f" ] || continue
  p=$(jq -r '.pid // 0' "$f" 2>/dev/null); p=${p:-0}
  { [ "$p" -gt 0 ] 2>/dev/null && kill -0 "$p" 2>/dev/null; } || rm -f "$f"
done
case "$sid" in ''|*[!A-Za-z0-9-]*) sid="" ;; esac  # unsafe id: do not use it in a path
if [ -n "$sid" ]; then
  jq -n --arg sid "$sid" --arg role "$role" --arg init "$init" --arg cwd "$cwd" --arg src "$src" \
     --arg pid "${cpid:-0}" --arg t "$(date -Is)" \
     '{session_id:$sid, role:$role, initiative:$init, cwd:$cwd, source:$src, pid:($pid|tonumber), started:$t}' \
     > "$REG/$sid.json" 2>/dev/null
fi
# context for the model (kept short)
echo "## Agent framework - session context"
echo "This session: role=$role initiative=$init. Tables: agents/ROUTING.md. Hook gates are active on Bash."
[ "$role" = interactive ] && echo "Routing: a question about whether a service works is an INCIDENT - /overlord -> on-call first, before any by-hand diagnosis."
n=$(ls "$REG"/*.json 2>/dev/null | wc -l)
if [ "$n" -gt 1 ]; then
  echo "Other LIVE sessions (do not fight them):"
  for f in "$REG"/*.json; do
    s=$(jq -r '.session_id' "$f" 2>/dev/null); [ "$s" = "$sid" ] && continue
    jq -r '"- \(.role) \(.initiative) since \(.started) cwd=\(.cwd)"' "$f" 2>/dev/null
  done
fi
ov="$REPO/agents/state/overlord.md"
if [ -f "$ov" ] && [ "$role" = "interactive" ]; then
  echo "Overlord state (head of agents/state/overlord.md):"
  awk '/^## Open initiatives/,/^## Recently closed/' "$ov" | grep -E '^\|' | grep -vE '^\|[- |]+$' | head -12 | sed 's/^/  /'
fi
# rotation (agents/prompts/rotation.md): a carry written in the last 24 h is the successor's first read.
# The role name becomes part of a path, so only plain names are used; a symlinked carry is never read.
crole="${AGENT_ROLE:-overlord}"
case "$crole" in ''|*[!A-Za-z0-9_-]*) crole="" ;; esac
carry="$REPO/agents/state/carry/$crole.md"
if [ -n "$crole" ] && [ ! -L "$REPO/agents/state/carry" ] && [ ! -L "$carry" ] && [ -f "$carry" ] \
   && [ -n "$(find "$carry" -mmin -1440 2>/dev/null)" ]; then
  echo "Carry from the previous $crole session (agents/state/carry/$crole.md, first 40 lines - read it, then your usual start-up reads):"
  head -40 "$carry" 2>/dev/null
fi
dl="$REPO/agents/state/drift.log"
[ -f "$dl" ] && { c=$(grep -vc '^#' "$dl"); echo "Drift lines total: $c (last: $(grep -v '^#' "$dl" | tail -1 | cut -c1-120))"; }
exit 0
