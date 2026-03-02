#!/bin/bash
# Wine wrapper for WSL2: initializes WINEPREFIX before running rcedit (used by electron-builder)
# Usage: WINE=$(pwd)/scripts/wine-wsl.sh pnpm run dist
export WINEPREFIX="${WINEPREFIX:-$HOME/.wine-eb}"
export WINEARCH="${WINEARCH:-win32}"
exec /usr/bin/wine "$@"
