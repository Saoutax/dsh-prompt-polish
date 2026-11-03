#!/usr/bin/env bash
# Verify the packed tarball in dist/ carries both plugin halves and its patch.
#
# `pnpm pack` succeeding only means npm accepted the file list; it says nothing
# about whether the generated lib/ output actually ended up inside the tarball.
# This catches a build or `files` misconfiguration before it reaches a Release.
set -euo pipefail

tarball=$(ls dist/*.tgz)
echo "packed $tarball"
listing=$(tar -tzf "$tarball")

required_files=(
    package/lib/index.js
    package/lib/client.js
    package/cordis.patch.yml
)

for required in "${required_files[@]}"; do
    if ! grep -qx "$required" <<<"$listing"; then
        echo "::error::$tarball is missing $required"
        exit 1
    fi
done

echo "$tarball carries every required file"
