#!/usr/bin/env bash
# UserPromptSubmit hook - H6: context-size notice for attended sessions.
# Every turn re-reads the whole context from cache, and a turn after a long idle re-WRITES all of it
# (the 1 h cache TTL). This hook never blocks: it tells the owner (systemMessage) and the model
# (additionalContext) when a fresh session would be cheaper. Exit 0 always, including on its own errors.
#
# Inert unless AGENTS_REPO (or, if unset, the session's project dir) contains agents/estate.env.
# Thresholds: context-watch.conf next to this file (PARSED, never sourced; digits only).
# State: $AGENTS_REPO/agents/state/sessions/<session_id>.ctx (the highest tier already announced).
# AGENTS_REPO (the owner named it) wins. Else the session's project dir - read-only use then:
# its config is still parsed (it can only add blocks), but nothing in it is executed or written.
REPO="${AGENTS_REPO:-}"; OWN=1
[ -n "$REPO" ] || { REPO="${CLAUDE_PROJECT_DIR:-}"; OWN=0; }
[ -n "$REPO" ] && [ -f "$REPO/agents/estate.env" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
[ "${AGENT_ROLE:-interactive}" = interactive ] || exit 0   # headless runs have their own ceiling

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || exit 0
WARN_AT=150000 STEP=100000 IDLE_MIN=55 IDLE_CTX=60000
if [ -f "$here/context-watch.conf" ]; then
  while IFS='=' read -r k v || [ -n "$k" ]; do
    k="${k//[[:space:]]/}"
    v="${v%%#*}"; v="${v//[[:space:]]/}"
    case "$v" in ''|*[!0-9]*) continue ;; esac
    case "$k" in
      WARN_AT) WARN_AT="$v" ;;
      STEP) STEP="$v" ;;
      IDLE_MIN) IDLE_MIN="$v" ;;
      IDLE_CTX) IDLE_CTX="$v" ;;
    esac
  done < "$here/context-watch.conf" 2>/dev/null
fi
[ "$STEP" -gt 0 ] 2>/dev/null || STEP=100000

in="$(cat)"
tp="$(printf '%s' "$in" | jq -r '.transcript_path // empty' 2>/dev/null)"
sid="$(printf '%s' "$in" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$tp" ] && [ -f "$tp" ] && [ -n "$sid" ] || exit 0
case "$sid" in *[!A-Za-z0-9-]*) exit 0 ;; esac

last="$(tac "$tp" 2>/dev/null | grep -m1 '"type":"assistant".*"usage"' | jq -c 'select(.isSidechain != true)' 2>/dev/null)"
[ -n "$last" ] || exit 0
ctx=$(printf '%s' "$last" | jq '.message.usage | (.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0)' 2>/dev/null)
case "$ctx" in ''|*[!0-9]*) exit 0 ;; esac
ts=$(printf '%s' "$last" | jq -r '.timestamp // empty' 2>/dev/null)
idle=0; [ -n "$ts" ] && idle=$(( ( $(date +%s) - $(date -d "$ts" +%s 2>/dev/null || date +%s) ) / 60 ))

[ "$OWN" = 1 ] || exit 0   # project-dir fallback: write nothing
# never follow a symlinked state dir (a cloned repo could point it at another folder)
[ -L "$REPO/agents/state" ] || [ -L "$REPO/agents/state/sessions" ] && exit 0
st="$REPO/agents/state/sessions"
mkdir -p "$st" 2>/dev/null || exit 0
f="$st/$sid.ctx"
tier=$(cat "$f" 2>/dev/null); case "$tier" in ''|*[!0-9]*) tier=0 ;; esac
k=$(( ctx / 1000 ))
msg=""
if [ "$idle" -ge "$IDLE_MIN" ] && [ "$ctx" -ge "$IDLE_CTX" ]; then
  msg="Context notice: this session was idle ${idle} min with ~${k}k tokens of context - this turn re-writes the whole cache. If the next step is a new topic, a fresh session is cheaper (state lives in the repo)."
elif [ "$ctx" -ge "$WARN_AT" ]; then
  now=$(( (ctx - WARN_AT) / STEP + 1 ))
  if [ "$now" -gt "$tier" ]; then
    echo "$now" > "$f" 2>/dev/null
    msg="Context notice: ~${k}k tokens - every turn now re-reads all of it. Time to wrap up: close this session and continue in a fresh one."
  fi
fi
[ -n "$msg" ] || exit 0
jq -n --arg m "$msg" '{systemMessage:$m, hookSpecificOutput:{hookEventName:"UserPromptSubmit",
  additionalContext:("[H6] " + $m + " Open your reply with this notice in one line, then propose a hand-off: what to record in the repo/state so a fresh session can continue.")}}' 2>/dev/null
exit 0
