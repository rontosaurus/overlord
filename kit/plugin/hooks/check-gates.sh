#!/usr/bin/env bash
# Gate regression runner. Needs bash + jq.
#   check-gates.sh                   replay hooks/cases.txt (plus built-in config-safety tests)
#   check-gates.sh --live "<text>"   run <text> through guard-bash.sh with YOUR real config: $AGENTS_REPO,
#                                    else $CLAUDE_PROJECT_DIR, else the current folder if it holds
#                                    agents/estate.env (role: $AGENT_ROLE, default interactive). Prints BLOCKED
#                                    plus the message, or "allowed". Always exits 0. Nothing is run.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

if [ "${1:-}" = "--live" ]; then
  [ $# -ge 2 ] || { echo 'usage: check-gates.sh --live "<command text>"' >&2; exit 0; }
  live="${AGENTS_REPO:-${CLAUDE_PROJECT_DIR:-}}"
  [ -n "$live" ] || { [ -f "$PWD/agents/estate.env" ] && live="$PWD"; }
  [ -n "$live" ] || { echo "AGENTS_REPO is not set and this folder has no agents/estate.env - the gates are inert (allowed)"; exit 0; }
  [ -f "$live/agents/estate.env" ] || { echo "no agents/estate.env in $live - the gates are inert (allowed)"; exit 0; }
  echo "config: $live"
  out="$(AGENTS_REPO="$live" AGENT_EVAL=1 bash -c 'jq -n --arg c "$1" "{tool_input:{command:\$c}}" | bash "$2"' _ "$2" "$here/guard-bash.sh" 2>&1)"; rc=$?
  if [ $rc -eq 2 ]; then echo "BLOCKED"; printf '%s\n' "$out"
  elif printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "ask"' >/dev/null 2>&1; then
    echo "ASK (this session would get a permission prompt)"; printf '%s\n' "$out" | jq -r '.hookSpecificOutput.permissionDecisionReason'
  else echo "allowed"; fi
  exit 0
fi
case "${1:-}" in -h|--help) sed -n '2,7p' "$0"; exit 0 ;; esac

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/agents"
echo 'SECRET_CLI=secretcli' > "$tmp/agents/estate.env"
printf "%s\n" "H1_PATTERNS='forbidden-target'" "H4_PROVIDER_HOSTS='api.provider.example'" "H4_NEVER_PATHS='/data/photos|_keep'" "H4_ASK_PATTERNS='deploy-to-prod'" > "$tmp/agents/guard.conf"
export AGENTS_REPO="$tmp" AGENT_EVAL=1
pass=0; fail=0; role=""; exp=""; kind=""; cmd=""
ok() { pass=$((pass+1)); echo "PASS $1"; }
bad() { fail=$((fail+1)); echo "FAIL $1"; }
run() { # evaluate the case collected so far
  [ -n "$role" ] || return 0
  local out rc got script so errf
  errf="$tmp/stderr.$$"
  if [ "$role" = interactive ]; then unset AGENT_ROLE; else export AGENT_ROLE="$role"; fi
  if [ "$kind" = tool ]; then
    script=guard-tools.sh
    so="$(jq -n --arg c "$cmd" '{tool_name:"mcp__example__send",tool_input:{body:$c}}' | bash "$here/$script" 2>"$errf")"; rc=$?; out="$(cat "$errf")"
  else
    script=guard-bash.sh
    pm=default; [ "$kind" = bypass ] && pm=bypassPermissions
    so="$(jq -n --arg c "$cmd" --arg pm "$pm" '{tool_input:{command:$c},permission_mode:$pm}' | bash "$here/$script" 2>"$errf")"; rc=$?; out="$(cat "$errf")"
  fi
  if [ $rc -eq 2 ]; then got="block:$(printf '%s' "$out" | sed -n 's/^BLOCKED by gate \([A-Z0-9]*\):.*/\1/p' | head -1)"
  elif [ $rc -eq 0 ] && printf '%s' "$so" | jq -e '.hookSpecificOutput.permissionDecision == "ask"' >/dev/null 2>&1; then
    got="ask:$(printf '%s' "$so" | jq -r '.hookSpecificOutput.permissionDecisionReason' | sed -n 's/^ASK by gate \([A-Z0-9]*\):.*/\1/p' | head -1)"
  else got=allow; fi
  if [ "$got" = "$exp" ]; then ok "[$role $exp${kind:+ $kind}] $(printf '%s' "$cmd" | head -1 | cut -c1-70)"
  else bad "[$role expected $exp, got $got (rc=$rc)${kind:+ $kind}] $(printf '%s' "$cmd" | head -1 | cut -c1-70)"; fi
}
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '### '*) run; kind=""; read -r _ role exp kind <<< "$line"; cmd="" ;;
    '#'*|'') ;;
    *) cmd="${cmd:+$cmd$'\n'}$line" ;;
  esac
done < "$here/cases.txt"
run
unset AGENT_ROLE

# ---- built-in config-safety tests (need their own config files) ----
probe() { # $1 script, $2 json -> prints rc
  printf '%s' "$2" | bash "$here/$1" >/dev/null 2>&1; echo $?
}
bashjson='{"tool_input":{"command":"echo hello"}}'
ownjson='{"tool_input":{"command":"curl https://x.example/FORBIDDEN-target"}}'

# 1. config containing command substitutions must never execute
pwn="$tmp/hat-pwn"; rm -f "$pwn"
printf "%s\n" "SECRET_CLI=\$(touch $pwn)" "H1_PATTERNS='forbidden-target'" "\$(touch $pwn)" "touch $pwn" "H4_PROVIDER_HOSTS=\`touch $pwn\`" > "$tmp/agents/guard.conf"
printf "%s\n" "SECRET_CLI=\$(touch $pwn)" "\$(touch $pwn)" > "$tmp/agents/estate.env"
probe guard-bash.sh "$bashjson" >/dev/null; probe guard-tools.sh "$bashjson" >/dev/null
bash "$here/session-start.sh" </dev/null >/dev/null 2>&1; echo '{"session_id":"abc-1"}' | bash "$here/session-start.sh" >/dev/null 2>&1
if [ -e "$pwn" ]; then bad "[config] command substitution in config EXECUTED"; rm -f "$pwn"; else ok "[config] command substitution in config is not executed"; fi

# 2. H1 is case-insensitive in Bash and tool hooks (and the parsed config still works)
[ "$(probe guard-bash.sh "$ownjson")" = 2 ] && ok "[config] H1 case-insensitive (bash, config with junk lines)" || bad "[config] H1 case-insensitive (bash)"
[ "$(probe guard-tools.sh '{"tool_name":"mcp__x__send","tool_input":{"to":"Forbidden-Target"}}')" = 2 ] && ok "[config] H1 case-insensitive (tool)" || bad "[config] H1 case-insensitive (tool)"

# 3. malformed / hostile config stays inert (exit 0) and never crashes
printf '%s\n' "H1_PATTERNS=" "=====" "'" '"' "H1_PATTERNS" "   " > "$tmp/agents/guard.conf"
r1="$(probe guard-bash.sh "$ownjson")"; r2="$(probe guard-tools.sh "$ownjson")"
[ "$r1" = 0 ] && [ "$r2" = 0 ] && ok "[config] malformed config is inert" || bad "[config] malformed config (rc $r1/$r2)"
printf 'H1_PATTERNS="unterminated\n' > "$tmp/agents/guard.conf"
[ "$(probe guard-bash.sh '{"tool_input":{"command":"echo hi"}}')" = 0 ] && ok "[config] unterminated quote does not block or crash" || bad "[config] unterminated quote"
printf 'H1_PATTERNS=[unclosed\n' > "$tmp/agents/guard.conf"
[ "$(probe guard-bash.sh "$ownjson")" = 0 ] && [ "$(probe guard-tools.sh "$ownjson")" = 0 ] && ok "[config] invalid regex never exits 2" || bad "[config] invalid regex"

# 4. unsafe session_id is not used as a path
mkdir -p "$tmp/agents/state/sessions"
echo '{"session_id":"../../evil"}' | bash "$here/session-start.sh" >/dev/null 2>&1
[ -e "$tmp/agents/evil.json" ] || [ -e "$tmp/agents/state/evil.json" ] && bad "[session] unsafe session_id written" || ok "[session] unsafe session_id skipped"

# 5. H6 context-watch: notice at ~160k, silent at ~10k, silent for headless roles and unsafe session ids
printf '%s\n' "SECRET_CLI=secretcli" > "$tmp/agents/estate.env"
rm -rf "$tmp/agents/state/sessions"
mk_tr() { # $1 file, $2 total input tokens
  jq -nc --argjson n "$2" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{type:"assistant",timestamp:$t,message:{usage:{input_tokens:1,cache_read_input_tokens:$n,cache_creation_input_tokens:0}}}' > "$1"
}
cw() { # $1 transcript, $2 session id, $3 role ("" = interactive); prints hook output
  local r="$3"
  jq -nc --arg p "$1" --arg s "$2" '{transcript_path:$p,session_id:$s}' \
    | if [ -n "$r" ]; then AGENT_ROLE="$r" bash "$here/context-watch.sh" 2>/dev/null; else env -u AGENT_ROLE bash "$here/context-watch.sh" 2>/dev/null; fi
}
mk_tr "$tmp/big.jsonl" 160000; mk_tr "$tmp/small.jsonl" 10000
case "$(cw "$tmp/big.jsonl" sess-big "")" in *"Context notice"*) ok "[H6] ~160k tokens -> notice" ;; *) bad "[H6] ~160k tokens -> notice" ;; esac
[ -z "$(cw "$tmp/small.jsonl" sess-small "")" ] && ok "[H6] ~10k tokens -> silent" || bad "[H6] ~10k tokens -> silent"
[ -z "$(cw "$tmp/big.jsonl" sess-ovs overseer)" ] && ok "[H6] AGENT_ROLE=overseer -> silent" || bad "[H6] AGENT_ROLE=overseer -> silent"
[ -z "$(cw "$tmp/big.jsonl" '../../evil' "")" ] && [ ! -e "$tmp/agents/evil.ctx" ] && ok "[H6] bad session id -> silent" || bad "[H6] bad session id -> silent"

# 6. no AGENTS_REPO: the session's project dir (CLAUDE_PROJECT_DIR) is the fallback
printf "%s\n" "H1_PATTERNS='forbidden-target'" > "$tmp/agents/guard.conf"
r1="$(printf '%s' "$ownjson" | env -u AGENTS_REPO CLAUDE_PROJECT_DIR="$tmp" bash "$here/guard-bash.sh" >/dev/null 2>&1; echo $?)"
r2="$(printf '%s' "$ownjson" | env -u AGENTS_REPO -u CLAUDE_PROJECT_DIR bash "$here/guard-bash.sh" >/dev/null 2>&1; echo $?)"
[ "$r1" = 2 ] && ok "[repo] no AGENTS_REPO, CLAUDE_PROJECT_DIR has estate.env -> H1 blocks" || bad "[repo] project-dir fallback (rc $r1)"
[ "$r2" = 0 ] && ok "[repo] neither set -> inert" || bad "[repo] neither set (rc $r2)"
# 7. fallback mode runs nothing from the folder and writes nothing into it
mkdir -p "$tmp/agents/bin"; mark="$tmp/drift-ran"
printf '#!/usr/bin/env bash\ntouch "%s"\n' "$mark" > "$tmp/agents/bin/drift"; chmod +x "$tmp/agents/bin/drift"
printf '%s' "$ownjson" | env -u AGENTS_REPO -u AGENT_EVAL CLAUDE_PROJECT_DIR="$tmp" bash "$here/guard-bash.sh" >/dev/null 2>&1
printf '%s' '{"tool_name":"mcp__x__send","tool_input":{"to":"forbidden-target"}}' \
  | env -u AGENTS_REPO -u AGENT_EVAL CLAUDE_PROJECT_DIR="$tmp" bash "$here/guard-tools.sh" >/dev/null 2>&1
[ -e "$mark" ] && bad "[repo] fallback executed the folder's agents/bin/drift" || ok "[repo] fallback never executes agents/bin/drift"
rm -rf "$tmp/agents/state"
echo '{"session_id":"fb-1"}' | env -u AGENTS_REPO CLAUDE_PROJECT_DIR="$tmp" bash "$here/session-start.sh" >/dev/null 2>&1
[ -e "$tmp/agents/state" ] && bad "[repo] fallback session-start wrote state" || ok "[repo] fallback session-start writes nothing"
rm -f "$tmp/agents/bin/drift"
# 8. a symlinked state dir is never followed (prune would delete *.json in the target)
victim="$(mktemp -d)"; echo '{"pid":0}' > "$victim/keep.json"
mkdir -p "$tmp/agents/state"; ln -s "$victim" "$tmp/agents/state/sessions"
echo '{"session_id":"sym-1"}' | bash "$here/session-start.sh" >/dev/null 2>&1
echo '{"session_id":"sym-1"}' | bash "$here/session-end.sh" >/dev/null 2>&1
[ -e "$victim/keep.json" ] && [ ! -e "$victim/sym-1.json" ] && ok "[session] symlinked sessions dir not followed" || bad "[session] symlinked sessions dir followed"
rm -f "$tmp/agents/state/sessions"; rm -rf "$victim"

# 9. an ask or block leaves a drift line in the OWN repo only, never through a symlinked state dir
#    (the drift stub below stands in for agents/bin/drift; run without AGENT_EVAL so the hook calls it)
printf "%s\n" "H1_PATTERNS='forbidden-target'" > "$tmp/agents/guard.conf"
printf '#!/usr/bin/env bash\necho "$1" >> "%s/drift-kinds"\n' "$tmp" > "$tmp/agents/bin/drift"; chmod +x "$tmp/agents/bin/drift"
rm -rf "$tmp/agents/state"; rm -f "$tmp/drift-kinds"
askjson='{"tool_input":{"command":"helm uninstall myapp"},"agent_type":"worker"}'
printf '%s' "$askjson" | env -u AGENT_EVAL -u AGENT_ROLE bash "$here/guard-bash.sh" >/dev/null 2>&1
printf '%s' "$ownjson" | env -u AGENT_EVAL bash "$here/guard-bash.sh" >/dev/null 2>&1
grep -qx 'hook-ask:H4' "$tmp/drift-kinds" 2>/dev/null && grep -qx 'hook-block:H1' "$tmp/drift-kinds" 2>/dev/null \
  && ok "[drift] ask and block each leave a drift line in the own repo" || bad "[drift] ask/block drift lines"
rm -f "$tmp/drift-kinds"; mkdir -p "$tmp/agents/state"; vic2="$(mktemp -d)"; rm -rf "$tmp/agents/state"; ln -s "$vic2" "$tmp/agents/state"
printf '%s' "$askjson" | env -u AGENT_EVAL -u AGENT_ROLE bash "$here/guard-bash.sh" >/dev/null 2>&1
[ -e "$tmp/drift-kinds" ] && bad "[drift] hook called drift through a symlinked state dir" || ok "[drift] symlinked state dir -> drift not called"
rm -f "$tmp/agents/state"; rm -rf "$vic2" "$tmp/agents/bin/drift"
# the ask output is valid permission JSON naming the gate
o="$(printf '%s' "$askjson" | env -u AGENT_ROLE AGENT_EVAL=1 bash "$here/guard-bash.sh" 2>/dev/null)"
printf '%s' "$o" | jq -e '.hookSpecificOutput | (.hookEventName=="PreToolUse" and .permissionDecision=="ask" and (.permissionDecisionReason|startswith("ASK by gate H4")))' >/dev/null 2>&1 \
  && ok "[ask] output is a PreToolUse permissionDecision=ask naming H4" || bad "[ask] output shape"

# 10. SessionStart prints a fresh carry, skips a stale one, a symlinked one, and an unsafe role name
echo 'SECRET_CLI=' > "$tmp/agents/estate.env"; rm -rf "$tmp/agents/state"; mkdir -p "$tmp/agents/state/carry"
echo "CARRY-MARKER-1" > "$tmp/agents/state/carry/overlord.md"
echo "CARRY-MARKER-2" > "$tmp/agents/state/carry/worker.md"
echo '{"session_id":"c-1"}' | env -u AGENT_ROLE bash "$here/session-start.sh" 2>/dev/null | grep -q CARRY-MARKER-1 \
  && ok "[carry] fresh carry is printed at session start" || bad "[carry] fresh carry not printed"
echo '{"session_id":"c-2"}' | AGENT_ROLE=worker bash "$here/session-start.sh" 2>/dev/null | grep -q CARRY-MARKER-2 \
  && ok "[carry] carry is per role" || bad "[carry] per-role carry"
touch -d '3 days ago' "$tmp/agents/state/carry/overlord.md"
echo '{"session_id":"c-3"}' | env -u AGENT_ROLE bash "$here/session-start.sh" 2>/dev/null | grep -q CARRY-MARKER-1 \
  && bad "[carry] stale carry printed" || ok "[carry] a carry older than 24 h is not printed"
rm -f "$tmp/agents/state/carry/overlord.md"; echo "CARRY-OUTSIDE" > "$tmp/outside.md"; ln -s "$tmp/outside.md" "$tmp/agents/state/carry/overlord.md"
echo '{"session_id":"c-4"}' | env -u AGENT_ROLE bash "$here/session-start.sh" 2>/dev/null | grep -q CARRY-OUTSIDE \
  && bad "[carry] symlinked carry followed" || ok "[carry] a symlinked carry is not read"
echo '{"session_id":"c-5"}' | AGENT_ROLE='../../outside' bash "$here/session-start.sh" 2>/dev/null | grep -q CARRY-OUTSIDE \
  && bad "[carry] unsafe role used in a path" || ok "[carry] an unsafe role name is not used in a path"
mkdir -p "$tmp/victim-carry"; echo "CARRY-VIA-DIR" > "$tmp/victim-carry/overlord.md"; rm -rf "$tmp/agents/state/carry"; ln -s "$tmp/victim-carry" "$tmp/agents/state/carry"
echo '{"session_id":"c-6"}' | env -u AGENT_ROLE bash "$here/session-start.sh" 2>/dev/null | grep -q CARRY-VIA-DIR \
  && bad "[carry] symlinked carry dir followed" || ok "[carry] a symlinked carry dir is not followed"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
