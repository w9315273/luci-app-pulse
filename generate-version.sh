#!/bin/sh
# PKG_VERSION is the only editable version source. No extra browser module.
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=$(sed -n 's/^PKG_VERSION[[:space:]]*:=[[:space:]]*//p' "$base/Makefile" | sed 's/[[:space:]]*$//')
case "$version" in ''|*[!A-Za-z0-9.+_-]*) echo 'Invalid or missing PKG_VERSION in Makefile' >&2; exit 1;; esac
output=${1:-"$base/htdocs/luci-static/resources/view/pulse/index.js"}
[ "$(grep -c '^var VERSION=.*// @pulse-version$' "$output")" = 1 ] || { echo 'Missing or duplicate version marker' >&2; exit 1; }
temporary=$(mktemp "$output.XXXXXX")
trap 'rm -f "$temporary"' 0
sed "s/^var VERSION=.*\/\/ @pulse-version$/var VERSION='$version'; \/\/ @pulse-version/" "$output" > "$temporary"
chmod 644 "$temporary"
mv "$temporary" "$output"
