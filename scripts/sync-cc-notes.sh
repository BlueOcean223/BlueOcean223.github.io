#!/usr/bin/env bash
# Re-sync the Claude Code source notes from the agent-learning repo into public/.
#
# These are plain static HTML+CSS with no build step, so this is a straight copy.
# CI only checks out this repo, so the files have to be committed here — run this
# whenever the source changes, then commit the result.
#
# Override the source with: SRC=/path/to/html npm run sync:cc-notes
set -euo pipefail

SRC="${SRC:-$HOME/code/agent-learning/docs/claude-code/html}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/cc-notes"

if [ ! -d "$SRC" ]; then
  echo "source not found: $SRC" >&2
  echo "clone BlueOcean223/agent-learning, or pass SRC=/path/to/html" >&2
  exit 1
fi

# --delete so files removed upstream also disappear here
rsync -a --delete "$SRC"/ "$DEST"/

echo "synced $(find "$DEST" -name '*.html' | wc -l | tr -d ' ') pages -> public/cc-notes"
git -C "$(dirname "$DEST")/.." status --short public/cc-notes
