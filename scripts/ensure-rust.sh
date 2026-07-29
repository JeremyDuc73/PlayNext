#!/usr/bin/env bash
# Source local toolchain if present, then verify cargo is available.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV="$ROOT/.tools/cargo/env"

if [[ -f "$LOCAL_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$LOCAL_ENV"
  export RUSTUP_HOME="${RUSTUP_HOME:-$ROOT/.tools/rustup}"
  export CARGO_HOME="${CARGO_HOME:-$ROOT/.tools/cargo}"
fi

if ! command -v cargo >/dev/null 2>&1; then
  cat <<'EOF' >&2
cargo introuvable.

Options :
  1) Installer Rust : https://rustup.rs/
  2) Ou utiliser le toolchain local du repo :
       source .tools/cargo/env

Pour l’installeur Windows (.exe NSIS) : build sur Windows natif
(PowerShell) ou via GitHub Actions — pas depuis WSL.
Voir docs/WINDOWS.md
EOF
  exit 1
fi

echo "Using cargo: $(command -v cargo) ($(cargo --version))"
