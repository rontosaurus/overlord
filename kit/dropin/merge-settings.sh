#!/usr/bin/env bash
# merge-settings.sh - add the hatchery lines to your Claude Code user settings, keeping everything
# you already have. Needs bash + jq. Dry run by default: it prints what it would change and stops.
#
#   merge-settings.sh --kit <kit folder> --repo <your repo folder> [--settings <file>] [--apply]
#
#   --kit       the folder that holds .claude-plugin/marketplace.json (this kit)
#   --repo      your own repo, the copy of template/ (it holds agents/ROUTING.md)
#   --settings  default: $HOME/.claude/settings.json
#   --apply     write it. A backup of the old file is kept next to it first.
#
# What it adds (from hatchery-settings.json next to this script), and the rules it keeps:
#   - permission DENY rules (permissions.deny) that stop Claude Code's Edit/Write tools touching the files that
#     govern the agent: your user settings, the plugin's hooks folder and ~/.claude/plugins, and in your repo
#     agents/state/ceiling.json, agents/guard.conf, agents/estate.env, agents/bin, agents/senses.d,
#     agents/prompts, agents/state/costs.tsv and .claude/, plus ~/.claude.json and ~/.config/systemd/. A deny rule holds in every permission mode, bypass included. It covers the
#     editor tools ONLY: a shell command is covered by the Bash hook (gate H7: redirections, sed -i, cp/mv/tee/
#     chmod... naming those paths), which is a pattern match, not a sandbox - it does not see a write made from
#     inside an interpreter or after a `cd`. Anything with real authority over the machine should also be
#     read-only to the agent's user at the filesystem level. Only entries you do not already have are appended;
#   - a marketplace named "hatchery" pointing at the kit folder (only if you have none by that name);
#   - the plugin hatchery@hatchery listed as DISABLED (only if you have not listed it yet - it never
#     turns a plugin on, and never turns yours off). You enable it yourself after reading the hooks;
#   - env AGENTS_REPO = your repo (only if you have not set it).
# Where you already have a value, yours stays and the script says so. Every other key is untouched and
# never printed (only the three entries are).
# A file that is not plain JSON (comments, a typo) is refused, not rewritten.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
kit="" repo="" settings="${HOME:?}/.claude/settings.json" apply=0
while [ $# -gt 0 ]; do
  case "$1" in
    --kit) kit="${2:-}"; shift 2 ;;
    --repo) repo="${2:-}"; shift 2 ;;
    --settings) settings="${2:-}"; shift 2 ;;
    --apply) apply=1; shift ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done
command -v jq >/dev/null 2>&1 || { echo "jq is required (install it first)" >&2; exit 1; }
[ -n "$kit" ] && [ -n "$repo" ] || { echo "usage: $0 --kit <dir> --repo <dir> [--settings <file>] [--apply]" >&2; exit 64; }
[ -f "$kit/.claude-plugin/marketplace.json" ] || { echo "not the kit folder (no .claude-plugin/marketplace.json): $kit" >&2; exit 1; }
[ -f "$repo/agents/ROUTING.md" ] || { echo "not your repo (no agents/ROUTING.md): $repo" >&2; exit 1; }

# Absolute paths, in the form Claude Code on Windows and Git Bash both read (C:/Users/...).
abs() { (cd "$1" && pwd); }
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
kit_p="$(winpath "$(abs "$kit")")"
repo_p="$(winpath "$(abs "$repo")")"

# permission rules write an absolute path as //<path>; a Windows drive C:/x becomes //c/x
case "$kit_p" in
  [A-Za-z]:/*) d="$(printf '%s' "${kit_p:0:1}" | tr 'A-Z' 'a-z')"; kit_d="/$d${kit_p:2}" ;;
  *) kit_d="$kit_p" ;;
esac
kit_d="/${kit_d%/}"
case "$repo_p" in
  [A-Za-z]:/*) d="$(printf '%s' "${repo_p:0:1}" | tr 'A-Z' 'a-z')"; repo_d="/$d${repo_p:2}" ;;
  *) repo_d="$repo_p" ;;
esac
repo_d="/${repo_d%/}"
frag="$(jq --arg kit "$kit_p" --arg repo "$repo_p" --arg kd "$kit_d" --arg rd "$repo_d" \
  'walk(if . == "@KIT@" then $kit elif . == "@REPO@" then $repo
        elif type == "string" then gsub("@KITDENY@"; $kd) | gsub("@REPODENY@"; $rd) else . end)' \
  "$here/hatchery-settings.json")"

if [ -f "$settings" ]; then
  cur="$(jq -e 'if type == "object" then . else error("not an object") end' "$settings" 2>/dev/null)" || {
    echo "REFUSED: $settings is not plain JSON (comments or a typo?). Nothing changed. Merge by hand." >&2
    exit 1
  }
else
  cur='{}'
fi

# Add each of the three entries only where you have none; yours wins everywhere else. Your file keeps
# its key order, and only the entries added (never your other values) are printed - settings files
# can hold tokens in "env", and this output lands in a transcript.
units='[["extraKnownMarketplaces","hatchery"],["enabledPlugins","hatchery@hatchery"],["env","AGENTS_REPO"]]'
new="$(jq -n --argjson f "$frag" --argjson c "$cur" --argjson u "$units" \
  'reduce $u[] as $p ($c; if getpath($p) == null then setpath($p; $f | getpath($p)) else . end)')" || {
  echo "REFUSED: could not add the entries (is \"env\" or \"enabledPlugins\" not an object?). Nothing changed." >&2
  exit 1
}
new="$(jq -n --argjson f "$frag" --argjson c "$new" '
  ($c.permissions // {}) as $p
  | if ($p | type) != "object" or (($p.deny // []) | type) != "array" then error("permissions is not an object / deny is not an array") else . end
  | $c | .permissions = ($p + {deny: (($p.deny // []) + (($f.permissions.deny // []) - ($p.deny // [])))})')" || {
  echo "REFUSED: could not add the deny rules (is \"permissions\" not an object?). Nothing changed." >&2
  exit 1
}
jq -rn --argjson f "$frag" --argjson c "$cur" '
  (($f.permissions.deny // []) - (($c.permissions // {}).deny // []))[] | "ADD:        permissions.deny += \(.)"'
jq -rn --argjson f "$frag" --argjson c "$cur" --argjson u "$units" '
  $u[] as $p | ($c | getpath($p)) as $cv | ($f | getpath($p)) as $fv
  | if $cv == null then "ADD:        \($p | join(".")) = \($fv | tojson)"
    elif $cv != $fv then "KEPT YOURS: \($p | join(".")) (already set; the kit would have set \($fv | tojson))"
    else empty end'

if [ "$(printf '%s' "$cur" | jq -c .)" = "$(printf '%s' "$new" | jq -c .)" ]; then
  echo "nothing to add: $settings already has every hatchery line"
  exit 0
fi
echo "(every other line in $settings stays as it is)"

if [ "$apply" -ne 1 ]; then
  echo "(dry run - nothing written. Re-run with --apply to write it.)"
  exit 0
fi
mkdir -p "$(dirname "$settings")"
if [ -f "$settings" ]; then
  backup="$settings.before-hatchery-$(date +%Y%m%d%H%M%S)"
  cp -pL "$settings" "$backup"
  echo "backup: $backup"
fi
target="$settings"
if [ -L "$settings" ]; then target="$(readlink -f "$settings")"; fi   # write through a symlink, never over it
tmp="$(mktemp "$(dirname "$target")/.settings.XXXXXX")"
printf '%s\n' "$new" | jq . > "$tmp"
mv "$tmp" "$target"
echo "written: $settings"
echo "The backup holds your old file in full - delete it once you are happy (it may hold tokens)."
