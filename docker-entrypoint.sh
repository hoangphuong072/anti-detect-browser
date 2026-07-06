#!/usr/bin/env sh
set -eu

if [ "${ADB_BUILD_RUNTIME_IMAGE:-1}" = "1" ]; then
  image="${CAMOUFOX_IMAGE:-camoufox-vnc:latest}"
  context="${ADB_RUNTIME_CONTEXT:-/app/runtime/camoufox-vnc}"

  if docker image inspect "$image" >/dev/null 2>&1; then
    if docker run --rm --entrypoint test "$image" -x /opt/camoufox-browser/camoufox-bin >/dev/null 2>&1; then
      echo "Runtime image $image already exists"
    else
      echo "Runtime image $image is missing Camoufox; rebuilding from $context"
      docker build --no-cache -t "$image" "$context"
    fi
  else
    echo "Building runtime image $image from $context"
    docker build -t "$image" "$context"
  fi
fi

exec "$@"
