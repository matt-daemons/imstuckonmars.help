#!/usr/bin/env bash
# Serves the packaged Worker build locally in workerd. Wrangler writes state
# next to its config, so it runs from a writable copy of the read-only build.
set -euo pipefail

work=$(mktemp -d "${TMPDIR:-/tmp}/imstuckonmars-help.XXXXXX")
trap 'rm -rf "$work"' EXIT

# Use portable options: macOS may provide BSD cp even when Wrangler is from Nix.
cp -R "$DIST_DIR"/. "$work"/
chmod -R u+w "$work"

wrangler dev --config "$work/server/wrangler.json" "$@" &
server=$!

# Background jobs ignore SIGINT in non-interactive shells, so forward it.
trap 'kill -TERM "$server" 2>/dev/null || true' INT TERM

status=0
wait "$server" || status=$?
if kill -0 "$server" 2>/dev/null; then
  wait "$server" || status=$?
fi
exit "$status"
