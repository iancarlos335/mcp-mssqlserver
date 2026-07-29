#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$SCRIPT_DIR/../skill/mssql-cli"
SKILL_NAME="mssql-cli"

TARGET="all"
UNINSTALL=0

if [ "$#" -gt 0 ]; then
  for arg in "$@"; do
    case "$arg" in
      --uninstall) UNINSTALL=1 ;;
      --target=*) TARGET="${arg#--target=}" ;;
      *)
        echo "Unknown argument: $arg" >&2
        echo "Usage: $0 [--target=claude|codex|antigravity|agentskills|all] [--uninstall]" >&2
        exit 1
        ;;
    esac
  done
fi

CODEX_SKILLS_HOME="${CODEX_HOME:-$HOME/.codex}"

claude_dir="$HOME/.claude/skills/$SKILL_NAME"
codex_dir="$CODEX_SKILLS_HOME/skills/$SKILL_NAME"
antigravity_dir="$HOME/.gemini/config/skills/$SKILL_NAME"
agentskills_dir="$HOME/.agents/skills/$SKILL_NAME"

get_dest() {
  case "$1" in
    claude) echo "$claude_dir" ;;
    codex) echo "$codex_dir" ;;
    antigravity) echo "$antigravity_dir" ;;
    agentskills) echo "$agentskills_dir" ;;
    *) echo "" ;;
  esac
}

if [ "$TARGET" = "all" ]; then
  targets="claude codex antigravity agentskills"
else
  targets="$TARGET"
fi

for t in $targets; do
  dest="$(get_dest "$t")"
  if [ -z "$dest" ]; then
    echo "Unknown target: $t" >&2
    exit 1
  fi
  if [ "$UNINSTALL" = "1" ]; then
    rm -rf "$dest"
    echo "Removed $dest"
  else
    mkdir -p "$dest"
    cp -R "$SKILL_SRC/." "$dest/"
    echo "Installed skill to $dest"
  fi
done
