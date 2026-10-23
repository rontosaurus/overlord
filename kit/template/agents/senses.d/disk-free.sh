#!/usr/bin/env bash
# sense: filesystems nearly full. Prints one row per filesystem over the threshold (default 90%, SENSE_DISK_PCT).
# Row format: severity<TAB>what<TAB>evidence<TAB>fix-list<TAB>runbook
limit="${SENSE_DISK_PCT:-90}"
df -P -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null | awk -v lim="$limit" 'NR>1 { gsub("%","",$5); if ($5+0 >= lim) printf "%s\tdisk nearly full: %s\t%s%% used of %s KiB\thand\t-\n", ($5+0>=97?"crit":"warn"), $6, $5, $2 }'
exit 0
