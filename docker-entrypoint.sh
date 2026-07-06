#!/usr/bin/env sh
set -eu

if [ "${ADB_BUILD_RUNTIME_IMAGE:-1}" = "1" ]; then
  image="${CAMOUFOX_IMAGE:-camoufox-vnc:latest}"
  context="${ADB_RUNTIME_CONTEXT:-/app/runtime/camoufox-vnc}"

  if docker image inspect "$image" >/dev/null 2>&1; then
    echo "Runtime image $image already exists"
  else
    echo "Building runtime image $image from $context"
    docker build -t "$image" "$context"
  fi
fi

exec "$@"
