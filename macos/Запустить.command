#!/bin/bash
# Двойной щелчок в Finder запускает мастер внутри отдельного браузера.
set -uo pipefail
PACKAGE_DIR="$(cd -P "$(dirname "$0")" && pwd)"
/bin/bash "$PACKAGE_DIR/app/portable.sh"
result=$?
if [ "$result" -ne 0 ]; then
  printf '\nНажмите Enter, чтобы закрыть это окно.\n'
  read -r unused || true
fi
exit "$result"
