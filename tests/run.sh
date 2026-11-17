#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

for script in install.sh generate-version.sh root/etc/init.d/pulse-traffic \
 root/etc/uci-defaults/90-pulse-migrate root/usr/libexec/pulse-docker \
 root/usr/libexec/pulse-temperature; do
 sh -n "$script"
done

node --test tests/*.test.cjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py' -v
