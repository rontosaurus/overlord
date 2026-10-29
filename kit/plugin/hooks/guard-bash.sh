#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) - mechanical gates H1, H2, H4, and the Bash side of H7. Three outcomes (two lists, "deny" and "ask"):
#   block  exit 2 + stderr "BLOCKED by gate Hn: ..." (the message reaches the model)
#            - H1, H2, the never-delete paths, and writes to the agent's own control files (H7), in EVERY session;
#            - the your-hand shapes and branch discipline in unattended runs (AGENT_ROLE set)
#   ask    exit 0 + JSON permissionDecision "ask" - the your-hand shapes in ATTENDED sessions and their
#            subagents: a permission prompt, and the owner's answer is the go for exactly that command.
#            Under permission_mode=bypassPermissions an ask would be auto-approved, so it BLOCKS instead.
#   allow  exit 0, no output
# Any error of this script's own exits 0 (allow). No `set -e` on purpose.
#
# Inert unless AGENTS_REPO (or, if unset, the session's project dir) contains agents/estate.env.
#   agents/estate.env  plain KEY=VALUE; optional SECRET_CLI=<name of a secret-manager CLI>
#   agents/guard.conf  optional H1_PATTERNS, H4_PROVIDER_HOSTS, H4_NEVER_PATHS, H4_ASK_PATTERNS (see template/agents/guard.conf.example)
# Both files are PARSED line by line, never executed or sourced: only the known keys are read,
# one pair of surrounding quotes is stripped, everything else is ignored.
# AGENTS_REPO (the owner named it) wins. Else the session's project dir - read-only use then:
# its config is still parsed (it can only add blocks), but nothing in it is executed or written.
REPO="${AGENTS_REPO:-}"; OWN=1
[ -n "$REPO" ] || { REPO="${CLAUDE_PROJECT_DIR:-}"; OWN=0; }
[ -n "$REPO" ] && [ -f "$REPO/agents/estate.env" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

SECRET_CLI=""; H1_PATTERNS=""; H4_PROVIDER_HOSTS=""; H4_NEVER_PATHS=""; H4_ASK_PATTERNS=""
parse_conf() { # $1 file; data only, no eval
  local k v
  [ -f "$1" ] || return 0
  while IFS='=' read -r k v || [ -n "$k" ]; do
    k="${k//[[:space:]]/}"; v="${v%$'\r'}"
    case "$k" in ''|'#'*) continue ;; esac
    v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
    case "$v" in
      \'*\') [ "${#v}" -ge 2 ] && v="${v:1:${#v}-2}" ;;
      \"*\") [ "${#v}" -ge 2 ] && v="${v:1:${#v}-2}" ;;
    esac
    case "$k" in
      SECRET_CLI) SECRET_CLI="$v" ;;
      H1_PATTERNS) H1_PATTERNS="$v" ;;
      H4_PROVIDER_HOSTS) H4_PROVIDER_HOSTS="$v" ;;
      H4_NEVER_PATHS) H4_NEVER_PATHS="$v" ;;
      H4_ASK_PATTERNS) H4_ASK_PATTERNS="$v" ;;
    esac
  done < "$1" 2>/dev/null
  return 0
}
parse_conf "$REPO/agents/estate.env"
parse_conf "$REPO/agents/guard.conf"

in="$(cat 2>/dev/null)"
cmd="$(printf '%s' "$in" | jq -r '.tool_input.command // empty' 2>/dev/null)" || exit 0
[ -z "$cmd" ] && exit 0
# Line continuations. The regexes are line-based, so `rm -rf \<newline> /path` must also be seen joined. But bash does
# not continue a comment or a quoted heredoc body, so the join alone could hide a line (`# note \<newline> sudo reboot`).
# Every full-text check therefore reads BOTH: $cmd becomes the raw text followed by the joined text. The heredoc
# stripper below reads $raw only. If sed cannot do the join the raw text is still checked.
joinlines() { sed -E ':a;/(^|[^\\])(\\\\)*\\$/{N;s/\\\n//;ba}' 2>/dev/null; }
raw="$cmd"
joined="$(printf '%s' "$raw" | joinlines)"
[ -n "$joined" ] && [ "$joined" != "$raw" ] && cmd="$raw"$'\n'"$joined"
atype="$(printf '%s' "$in" | jq -r '.agent_type // empty' 2>/dev/null)"
pmode="$(printf '%s' "$in" | jq -r '.permission_mode // empty' 2>/dev/null)"   # Claude Code passes it to hooks: default | plan | acceptEdits | bypassPermissions ...
role="${AGENT_ROLE:-interactive}"
who="$role"; [ -n "$atype" ] && who="$role/$atype"
init="${AGENT_INITIATIVE:--}"
DRIFT="$REPO/agents/bin/drift"

# $body = the command with heredoc DATA removed, so a file written through a heredoc is text, not commands. It is an
# ALLOWLIST, not a lexer: data is stripped only when the whole command is one opener line
#   cat|tee [-a|--append] [FILE] [>|>> FILE] <<[-]DELIM [>|>> FILE]     (plain FILE words: no quotes, $, backticks, ; & | < > ( ) \)
# followed by its body and the exact delimiter line, and nothing else but blank or whole-line comment lines (bash
# continues neither). An unquoted DELIM's body may not contain $( or a backtick (bash runs them), and an unquoted body
# line ending in a backslash bails (bash joins it onto the next line, which may be the delimiter). Anything else - a
# second command line (so a script written through a heredoc and run in the same command is seen), a function that
# shadows cat, python, a pipe, a here-string (<<<), an opener ending in a backslash, an unterminated heredoc - is
# judged on the FULL text (fail closed). $body serves ONLY the attended H2 and the attended H4 decision - the ask and,
# in a bypassPermissions session, the block that replaces that ask (same text, same decision); every other block (H1,
# unattended H2, H7, the never-delete list, every unattended H4) matches the FULL $cmd. The strip reads $raw: a quoted
# body is literal, so it is never joined. Known limit: a script written through a heredoc in one command and run by a
# LATER command is not caught (the guard never reads files); unattended runs see the full text of each command.
q="'"
body="$(printf '%s\n' "$raw" | awk -v q="$q" '
  function bail() { bad=1; exit }
  BEGIN { w="[A-Za-z_][A-Za-z0-9_]*"; f="[A-Za-z0-9_./~+=:@%,-]+"
          op="^[ \t]*(cat|tee)([ \t]+(-a|--append|>>?[ \t]*" f "|" f "))*[ \t]*<<-?[ \t]*(" w "|\"" w "\"|" q w q "|\\\\" w ")([ \t]*>>?[ \t]*" f ")?[ \t]*$" }
  hd  { t=$0; if (hdash) sub(/^\t+/, "", t)
        if (t == hdelim) { hd=0; done=1; next }
        if (!hq && ($0 ~ /`|\$\(/ || $0 ~ /(^|[^\\])(\\\\)*\\$/)) bail()
        next }
  /^[ \t]*(#.*)?$/ { print; next }                      # blank and whole-line comments (bash continues neither)
  { if (done || lines++) bail()                         # one command line, nothing after the body
    print
    if ($0 ~ /<</ && $0 ~ op) {
      r=$0; sub(/^[^<]*<</, "", r); hdash=(r ~ /^-/); sub(/^-?[ \t]*/, "", r)
      match(r, "^(" w "|\"" w "\"|" q w q "|\\\\" w ")"); hdelim=substr(r, 1, RLENGTH)
      hq=(hdelim !~ ("^" w "$")); gsub(/["\\]/, "", hdelim); gsub(q, "", hdelim); hd=1 } }
  END { if (bad || hd) exit 3 }' 2>/dev/null)" || body="$cmd"   # failed, or ended inside a heredoc: use the whole text
[ -n "$body" ] || body="$cmd"

TXT="$cmd"   # the text has() matches; set to "$body" only for the attended H2 and the attended ask decision
has() { printf '%s' "$TXT" | grep -Eq -- "$1" 2>/dev/null; }

note() { # $1 kind - drift line; own repo only, never in eval runs, never through a symlinked state dir
  if [ "$OWN" = 1 ] && [ "${AGENT_EVAL:-0}" != 1 ] && [ -x "$DRIFT" ] && [ ! -L "$REPO/agents/state" ]; then
    "$DRIFT" "$1" "$init" "$who: [$(printf '%s' "$2" | head -c 90 | tr '\n' ' ')]" >/dev/null 2>&1
  fi
}
block() { # $1 gate, $2 reason
  printf 'BLOCKED by gate %s: %s\n' "$1" "$2" >&2
  note "hook-block:$1" "$2"
  exit 2
}
ask() { # $1 gate, $2 reason - attended sessions: a permission prompt; the owner's answer is the go for exactly this command
  jq -cn --arg r "ASK by gate $1: $2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}' 2>/dev/null || exit 0
  note "hook-ask:$1" "$2"
  exit 0
}

# H1 - things that must never be messaged or sent to (your own list, in guard.conf)
if [ -n "$H1_PATTERNS" ] && printf '%s' "$cmd" | grep -Eiq -- "$H1_PATTERNS" 2>/dev/null; then
  block H1 "this command names a target on the never-send list (agents/guard.conf). Nothing leaves the owner's own devices and accounts without explicit permission for that specific message."
fi

# H2 - secret discipline (only when a secret-manager CLI is named in estate.env). An attended session matches $body
# (heredoc data is text); an unattended run matches the full text, heredoc bodies included.
if [ -n "$SECRET_CLI" ]; then
  TXT="$body"; [ "$role" != interactive ] && TXT="$cmd"
  cli="$(printf '%s' "$SECRET_CLI" | sed 's/[][\.*^$+?(){}|/]/\\&/g')"
  if has "\\b${cli}\\b"; then
    if has "\\b${cli}\\b[^|;&]* list\\b" && ! has 'jq'; then
      block H2 "a bare list command prints secret VALUES. Project it through jq to names and ids only."
    fi
    if has "\\b${cli}\\b[^|]* get\\b[^|]*(\\| *(cat|tee|echo)|(^|[^0-9&])>|1>|&>)"; then
      block H2 "never print or redirect a secret value: fetch it in-process into a shell variable, use it, never print it, never redirect it."
    fi
  fi
  TXT="$cmd"
  # A fetch inside an UNQUOTED heredoc body runs while the text is written, so the VALUE lands in the file. Full text,
  # every mode. The awk prints only the bodies of unquoted heredocs (<<EOF, <<-EOF); a quoted delimiter (<<'EOF') makes
  # the body literal and is not scanned.
  uh="$(printf '%s\n' "$raw" | awk '
    o { t=$0; if (dash) sub(/^\t+/, "", t); if (t == d) o=0; else print; next }
    match($0, /(^|[^<])<<-?[ \t]*[A-Za-z_][A-Za-z0-9_]*/) { d=substr($0, RSTART, RLENGTH); dash=(d ~ /<<-/); sub(/^[^<]*<<-?[ \t]*/, "", d); o=1 }' 2>/dev/null)"
  if [ -n "$uh" ] && printf '%s' "$uh" | grep -Eq -- '(\$\(|`)[^)`]*\b'"${cli}"'\b[^)`]* get\b' 2>/dev/null; then
    block H2 "a secret fetch inside an unquoted heredoc expands into the written text, so the value lands in the file. Fetch it at run time instead (or quote the delimiter and fetch outside the heredoc)."
  fi
fi

# Command-position prefixes shared by H7 and H4. cpos (H4) also accepts an opening quote ("sudo reboot" inside bash -c);
# c7 (H7) does not, so prose that merely starts with a verb inside quotes ("install step for ...") is not a write -
# it accepts a quote only straight after sh/bash -c, eval or ssh.
# wrap = any chain of prefix words (sudo, doas, nohup, exec, env, command, builtin, eval, xargs, nice, ionice, setsid,
# stdbuf, time, timeout <opts> <duration>), each with an optional path (/usr/bin/sudo) and its own options. sopt is one
# option of a prefix word: `-u root` (a letter option with an argument), `-n` / `--signal=KILL` (a flag), or `X=1` (an
# env assignment).
pfx='(/[^[:space:];&|]*/)?'
sopt=' +(-[A-Za-z] +[^- ][^ ]*|-[^ ]+|[A-Za-z_][A-Za-z0-9_]*=[^ ]*)'
wrap='('"$pfx"'(sudo|doas|nohup|exec|env|command|builtin|eval|xargs|nice|ionice|setsid|stdbuf|time|timeout('"$sopt"')* +[0-9.]+[smhd]?)('"$sopt"')* +)*'
cpos='(^|[;&|(`"'"$q"']|\$\()[[:space:]]*'"$wrap$pfx"
c7='((^|[;&|(`]|\$\()[[:space:]]*|(^|[[:space:];&|])((ba|da|z)?sh|eval|ssh[^;&|]*) +(-[a-zA-Z]+ +)*["'"$q"'][[:space:]]*)'"$wrap$pfx"

# H7 (Bash side) - the agent may not write the files that configure or run its own governor: the ceiling and the
# cost ledger, guard.conf / estate.env, agents/bin, senses.d, prompts, .claude/ settings and ~/.claude.json, the
# user systemd units, crontab, and the plugin's hooks folder. Blocks in EVERY mode. A PATTERN MATCH on the FULL text
# (heredoc bodies included, so heredoc prose that itself contains a redirect into a control file is a false positive):
# a write verb in command position (or a redirection) and a protected path in the same segment; cp/mv/install/ln/rsync
# only when the protected path is the DESTINATION. It is not a sandbox. It misses git checkout/restore/apply/am, curl -o, wget -O, tar -x/unzip,
# a path held in a variable, a `cd` first, and anything written from inside an interpreter. For real protection
# make those files read-only to the agent's user; the Edit/Write deny rules (dropin/) cover the editor tools.
PROT='(agents/(state/(ceiling\.json|costs\.tsv)|guard\.conf|estate\.env|bin|senses\.d|prompts)|\.config/systemd/|\.claude\.json|\.claude/(settings|hooks|plugins|agents|commands|skills)|(^|[^A-Za-z0-9_.-])plugin/hooks/)'
ptok='[^[:space:];&|]*'"$PROT"'[^[:space:];&|]*'
if has '(^|[^->=])>>?[[:space:]]*["'"$q"']?[^[:space:];&|<>]*'"$PROT" \
   || has "$c7"'tee\b[^;&|]*'"$PROT" \
   || has "$c7"'sed\b[^;&|]*([[:space:]]-[a-zA-Z]*i|--in-place)[^;&|]*'"$PROT" \
   || has "$c7"'(perl|ruby)\b[^;&|]*[[:space:]]-[a-zA-Z]*i[^;&|]*'"$PROT" \
   || has "$c7"'(rm|chmod|chown|truncate|touch|patch|dd|unlink|shred|mv)\b[^;&|]*'"$PROT" \
   || has "$c7"'git( +-[cC] +[^ ;&|]+)* +(rm|mv)\b[^;&|]*'"$PROT" \
   || has "$c7"'(cp|install|ln|rsync)\b[^;&|]* '"$ptok"'["'"$q"']?[[:space:]]*($|[;&|)])' \
   || has "$c7"'(cp|install|ln|rsync)\b[^;&|]*(-t|--target-directory)[ =]+'"$ptok" \
   || has "$c7"'crontab([[:space:]]+(-[a-km-zA-Z]|-([[:space:];&|]|$)|[^-[:space:];&|])|[[:space:]]*<|[[:space:]]*($|[;&|]))'; then
  block H7 "the agent may not write its own control files (agents/state/ceiling.json and costs.tsv, agents/guard.conf, agents/estate.env, agents/bin, agents/senses.d, agents/prompts, .claude/ settings, ~/.claude.json, user systemd units, crontab, the plugin hooks folder). Hand the owner the exact change instead."
fi
TXT="$cmd"

# NEVER list - deleting the owner's data. Blocks in every mode, not even a tap. H4_NEVER_PATHS in
# agents/guard.conf is an extended regex naming the data roots (photo library, documents, finance, ...).
# Matches the FULL text. It sees only paths NAMED in the command (see guard.conf.example). Caught shapes: rm -r with
# the path on either side of the flags (`rm -rf /p` and `rm /p -rf`), xargs rm -r fed from a command that names the
# path, find PATH -delete / -exec rm / -ok rm, rsync --delete* / --remove-source-files naming the path, unlink, shred.
# Accepted false positive: a `rsync --delete` that only READS from a data root (as the source) is blocked too.
# rf  = a recursive flag as its own word (-r, -R, -rf, -fr, --recursive); rmw = the word rm (not --rm, not rmdir);
# rmr PATHS = an rm -r that names PATHS, either order, or an xargs rm -r when PATHS is named anywhere in the text;
# fdel PATHS = find ... PATHS ... -delete | -exec rm | -ok rm.
rf='[[:space:]](-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)([[:space:]]|$)'
rmw='(^|[^-[:alnum:]_])rm\b'
rmr() { has "$rmw"'[^;&|]*('"$rf"'[^;&|]*'"$1"'|'"$1"'[^;&|]*'"$rf"')' || { has "$1" && has '\bxargs\b[^;&|]*'"$rmw"'[^;&|]*'"$rf"; }; }
fdel() { has '\bfind\b[^;&|]*'"$1"'[^;&|]*-(delete|(exec|ok)(dir)?[^;&|]*'"$rmw"'[[:space:]])'; }
if [ -n "$H4_NEVER_PATHS" ]; then
  dataroot='('"$H4_NEVER_PATHS"')'
  if rmr "$dataroot" \
     || fdel "$dataroot" \
     || has '\brsync\b[^;&|]*(--(del(ete[a-z-]*)?|remove-source-files)\b[^;&|]*'"$dataroot"'|'"$dataroot"'[^;&|]*--(del(ete[a-z-]*)?|remove-source-files)\b)' \
     || has '(^|[^-[:alnum:]_])(unlink|shred)\b[^;&|]*'"$dataroot"; then
    block H4 "never list: deleting the owner's data (agents/guard.conf H4_NEVER_PATHS) is not an agent action in any mode. Stage nothing; hand over the exact command."
  fi
fi

# H4 - "your hand" shapes: irreversible or hard-to-undo. Attended session (and its subagents): an ASK, the
# tap is the go. Unattended run (AGENT_ROLE set): BLOCK - stage it and list it under 'Needs human'.
# Power words match only in COMMAND POSITION (line start, after ; & | ( ` $( or an opening quote, through
# sudo/doas/env/nohup/exec/nice/timeout/... and their options, with or without a path prefix), never inside a word
# (shutdown-runbook.md, srv.shutdown()) or mid-prose; the rm and git matches stop at the next ; & |;
# `git -C <dir>` is seen through.
wend='([[:space:];&|)<>`"'"$q"']|$)'
g='git( +-[cC] +[^ ;&|]+)*'
# A `|` inside a quoted grep/rg pattern (journalctl | grep 'battery|shutdown') is regex alternation, not a pipe, so the
# command-position power words are matched against $tg: $TXT with each quoted PATTERN argument of grep, egrep, fgrep,
# zgrep and rg blanked to QX. Only literal patterns are blanked: a '...' pattern may not contain a double quote, and a
# "..." pattern may not contain an apostrophe, a $ or a backtick. Otherwise the opening quote could be a literal
# character inside the OTHER kind of quoting (echo "see grep 'x"; <power word>; echo 'y') and blanking would hide a real
# command; a pattern left alone costs at worst a false-positive ask. The ssh, bash -c, systemctl and sysrq checks still
# read $TXT. If sed cannot blank, $tg is $TXT (nothing is hidden). wend ends a power word at white space, ; & | ) < >
# a backtick or a quote, so `reboot>/dev/null` and `reboot</dev/null` count as the command.
hasg() { printf '%s' "$tg" | grep -Eq -- "$1" 2>/dev/null; }
h4scan() { # sets yh from $TXT
  yh=""
  tg="$(printf '%s' "$TXT" | sed -E ":a; s/(\b((e|f|z)?grep|rg)( +(-[^ '\"]+|QX))*) +('[^'\"]*'|\"[^\"'\$\`]*\")/\1 QX/; ta" 2>/dev/null)" || tg="$TXT"
  [ -n "$tg" ] || tg="$TXT"
  has 'kubectl +(delete|drain|cordon)\b' && ! has 'kubectl +delete +(pod|pods|po|job|jobs)\b' && yh="kubectl delete of a non-pod resource, or drain / cordon"
  has 'helm +(uninstall|delete)\b' && yh="helm uninstall"
  rmr '(/mnt|/opt|/var|/etc|/srv|~|\$HOME)' && yh="recursive rm on a live path"
  { hasg "$cpos"'(reboot|shutdown|poweroff|halt)'"$wend" \
    || hasg "$cpos"'(init|telinit) +[016sS]'"$wend" \
    || has '\bssh\b[^;&|]*[[:space:]"'"$q"']'"$pfx"'(sudo('"$sopt"')* +)?'"$pfx"'(reboot|shutdown|poweroff|halt)'"$wend" \
    || has '\b(bash|sh|zsh|dash|ksh)( +-[a-zA-Z]+)* +-[a-zA-Z]*c +'"$pfx"'(sudo('"$sopt"')* +)?'"$pfx"'(reboot|shutdown|poweroff|halt)'"$wend" \
    || has 'systemctl('"$sopt"')* +(reboot|soft-reboot|poweroff|halt|kexec|rescue|emergency|(isolate|start) +(reboot|poweroff|halt|kexec|rescue|emergency)(\.target)?)'"$wend" \
    || has '(>[[:space:]]*|\btee\b[^;&|]*)/proc/sysrq-trigger'; } && yh="host reboot / shutdown"
  has '\b(mdadm|parted|mkfs(\.[a-z0-9]+)?|wipefs|sgdisk|fdisk|lvremove|vgremove|pvremove)\b' && yh="storage layout tool"
  has "$g"' +push\b[^;&|]*(--force\b|--force-with-lease|[[:space:]]-f\b|[[:space:]]\+[A-Za-z])' && yh="a force push"
  has "$g"' +(filter-branch|filter-repo|reflog +expire|gc +--prune|update-ref +-d)' && yh="a git history rewrite"
  has "$g"' +branch +-D +main\b|'"$g"' +reset +--hard[^;&|]*(origin/)?main\b|'"$g"' +push[^;&|]*(--delete|:main\b)' && yh="deleting or resetting main"
  if [ -n "$H4_PROVIDER_HOSTS" ] && has "$H4_PROVIDER_HOSTS" && has '-X *(POST|PUT|PATCH|DELETE)|--request *(POST|PUT|PATCH|DELETE)|--data|-d |--json'; then
    yh="write call to a provider API (DNS, tunnel, network)"
  fi
  [ -n "$H4_ASK_PATTERNS" ] && has "$H4_ASK_PATTERNS" && yh="a command matching your own your-hand list (agents/guard.conf H4_ASK_PATTERNS)"
  return 0
}
if [ "$role" != interactive ]; then
  TXT="$cmd"; h4scan   # unattended: the FULL text, heredoc bodies included
  [ -n "$yh" ] && block H4 "unattended run ($who, $init) attempted a your-hand action: $yh. Stage it and list it under 'Needs human' instead."
else
  TXT="$body"; h4scan  # attended: heredoc DATA is text (a doc that mentions 'sudo reboot' is not a reboot)
  if [ -n "$yh" ]; then
    # An ask is only a gate if a human can answer it. Under bypassPermissions the prompt is auto-approved, so block.
    if [ "$pmode" = bypassPermissions ]; then
      block H4 "your-hand action ($yh) in a bypassPermissions session: an ask would be auto-approved, so it is blocked. Run it in a normal-permission session, or hand the exact command to the owner."
    fi
    ask H4 "your-hand action - $yh. Approve = your go for exactly this command (recorded as a hook-ask drift line); decline = it stays staged. (Headless 'claude -p' sessions cannot answer an ask and should run with AGENT_ROLE set, which blocks instead.)"
  fi
fi
TXT="$cmd"

# H4 - unattended only: branch discipline (attended sessions push and merge as the owner directs)
if [ "$role" != interactive ]; then
  u=""
  has "$g"' +push\b' && u="git push (pushing is the owner's decision)"
  has "$g"' +(update-ref|commit-tree)\b' && u="writing refs/objects by hand (git update-ref / commit-tree): commit with git commit on your own branch"
  has "$g"' +branch( +[^;&|]*)? +(-f|--force|-M|-C|--move|--copy)\b' && u="git branch -f/-M/-C (moving a branch by hand)"
  # A fast-forward from the remote's main is not "touching main" - but only when it is the WHOLE command: one line, no
  # ; & | (one fast-forward line must not excuse its neighbours).
  fastfwd='^[[:space:]]*git( +-C +[^ ;&|]+)? +merge +--ff-only +origin/main[[:space:]]*$'
  ff=0
  case "$raw" in *$'\n'*|*';'*|*'&'*|*'|'*) ;; *) printf '%s' "$raw" | grep -Eq -- "$fastfwd" 2>/dev/null && ff=1 ;; esac
  [ "$ff" = 0 ] && has "$g"' +(merge|rebase)[[:space:]][^;&|]*\bmain\b|'"$g"' +(switch|checkout) +main\b' && u="touching main (work stays on its own branch)"
  [ -n "$u" ] && block H4 "unattended run ($who, $init) attempted: $u. Stage it and list it under 'Needs human' instead."
fi
exit 0
