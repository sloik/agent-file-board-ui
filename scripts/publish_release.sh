#!/usr/bin/env bash
# Publish the tested artifact. Requires gh and GNU sort (GitHub's Linux runner).
set -euo pipefail

: "${GH_REPO:?Set GH_REPO to owner/repository}"
: "${RELEASE_TAG:?Set RELEASE_TAG to the tested version tag}"
[[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release tag'; exit 1; }

# Query errors fail the job; only a successful list can prove absence.
gh api --paginate "repos/$GH_REPO/releases?per_page=100" --jq '.[] | select(.draft == false and .prerelease == false) | .tag_name' > published-tags.txt
if grep -Fxq "$RELEASE_TAG" published-tags.txt; then
  echo "Release $RELEASE_TAG already published; preserving it."
  exit 0
fi

newest=$( { cat published-tags.txt; echo "$RELEASE_TAG"; } | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)
latest=false
if [[ "$newest" == "$RELEASE_TAG" ]]; then latest=true; fi
assets=(release-assets/board.html release-assets/desktop_opener.applescript release-assets/install_desktop_opener.py)
demo_since=$(printf '%s\n' 'v2.2.1' "$RELEASE_TAG" | sort -V | head -n 1)
if [[ "$demo_since" == 'v2.2.1' ]]; then assets+=(release-assets/agent-file-board-demo.zip); fi
package_since=$(printf '%s\n' 'v2.11.4' "$RELEASE_TAG" | sort -V | head -n 1)
if [[ "$package_since" == 'v2.11.4' ]]; then assets+=(release-assets/agent-file-board-viewer.zip release-assets/SHA256SUMS); fi
for asset in "${assets[@]}"; do
  [[ -f "$asset" ]] || { echo "Missing release asset: $asset"; exit 1; }
done
gh release create "$RELEASE_TAG" \
  "${assets[@]}" \
  --verify-tag --title "$RELEASE_TAG" \
  --notes-file release-assets/notes.md --latest="$latest"
