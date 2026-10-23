#!/usr/bin/env bash
# sense: failed systemd units. A no-op on systems without systemd. One row per failed unit.
command -v systemctl >/dev/null 2>&1 || exit 0
systemctl --failed --no-legend --plain 2>/dev/null | awk 'NF { printf "warn\tsystemd unit failed: %s\t%s\tfair\t-\n", $1, $0 }' | cut -c1-300
exit 0
