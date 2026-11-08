#!/bin/bash
# Отдельный браузер macOS: собственные файлы и профиль, без изменения системного браузера.
set -euo pipefail
umask 077

APP_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -P "$APP_DIR/.." && pwd)"
DATA_DIR="$PACKAGE_DIR/Data"
PROFILE_DIR="$DATA_DIR/Profile"
RUNTIME_DIR="$DATA_DIR/Browser"
LOG_DIR="$DATA_DIR/Logs"
LOCK_DIR="$DATA_DIR/.prepare-lock"
LOCK_OWNED=0

fail() {
  printf '\nНе удалось запустить Claude mini.\n%s\n' "$1" >&2
  printf 'Откройте «Начните здесь.html», раздел «Если не открылось».\n' >&2
  exit 1
}

cleanup() {
  # Удаляется только пустая блокировка именно этого запуска, профиль остаётся на месте.
  if [ "$LOCK_OWNED" = 1 ]; then
    rm -f "$LOCK_DIR/pid"
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

require_macos() {
  [ "$(uname -s)" = Darwin ] || fail 'Этот запуск предназначен для macOS. Для Windows нужен отдельный выпуск.'
  for utility in /usr/bin/ditto /usr/bin/shasum /usr/bin/codesign /usr/bin/open /usr/bin/plutil /usr/libexec/PlistBuddy; do
    [ -x "$utility" ] || fail "Не найдена системная программа: $utility"
  done
}

detect_arch() {
  # На Apple Silicon Терминал может работать через Rosetta: выбираем физическую платформу.
  if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then
    printf 'arm64'
  else
    case "$(uname -m)" in
      arm64) printf 'arm64' ;;
      x86_64) printf 'x64' ;;
      *) fail 'Эта модель Mac не поддерживается. Нужен Mac с Apple Silicon или Intel 64 bit.' ;;
    esac
  fi
}

encode_path() {
  # Кодируем байты UTF-8, чтобы пробелы, # и русские имена не меняли адрес локальной инструкции.
  local input="$1" output='' letter code index
  local LC_ALL=C
  for (( index=0; index<${#input}; index++ )); do
    letter="${input:index:1}"
    case "$letter" in
      [a-zA-Z0-9/._~-]) output="$output$letter" ;;
      *) printf -v code '%%%02X' "'$letter"; output="$output$code" ;;
    esac
  done
  printf '%s' "$output"
}

load_runtime_config() {
  [ -f "$APP_DIR/runtime.env" ] || fail 'В архиве нет app/runtime.env. Распакуйте выпуск целиком.'
  # Этот файл содержит только фиксированные значения, записанные сборщиком выпуска.
  . "$APP_DIR/runtime.env"
  case "$MAC_ARCH" in
    arm64) PAYLOAD="$PACKAGE_DIR/payload/chrome-mac-arm64.zip"; EXPECTED_SHA="$ARM64_SHA256"; SOURCE_ROOT=chrome-mac-arm64 ;;
    x64) PAYLOAD="$PACKAGE_DIR/payload/chrome-mac-x64.zip"; EXPECTED_SHA="$X64_SHA256"; SOURCE_ROOT=chrome-mac-x64 ;;
  esac
  [ -f "$PAYLOAD" ] || fail "Нужен архив выпуска для $MAC_ARCH. Браузер для этого Mac не найден в payload."
  CHROME_APP="$RUNTIME_DIR/Google Chrome for Testing.app"
  CHROME_BIN="$CHROME_APP/Contents/MacOS/Google Chrome for Testing"
}

check_system_version() {
  local current major
  current="$(/usr/bin/sw_vers -productVersion)"
  major="${current%%.*}"
  case "$major" in ''|*[!0-9]*) fail 'Не получилось определить версию macOS.' ;; esac
  [ "$major" -ge "$MIN_MACOS_MAJOR" ] || fail "Нужна macOS $MIN_MACOS_MAJOR или новее. Сейчас установлена $current."
}

acquire_prepare_lock() {
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    local previous=''
    [ ! -f "$LOCK_DIR/pid" ] || previous="$(cat "$LOCK_DIR/pid")"
    case "$previous" in
      ''|*[!0-9]*) fail 'Подготовка уже запущена или была прервана. Закройте окно подготовки и повторите запуск. Если ошибка осталась, переименуйте Data/.prepare-lock.' ;;
      *)
        if kill -0 "$previous" 2>/dev/null; then
          fail 'Браузер ещё подготавливается. Дождитесь первого окна, не запускайте подготовку второй раз.'
        fi
        rm -f "$LOCK_DIR/pid"
        rmdir "$LOCK_DIR" 2>/dev/null || fail 'Не получилось снять блокировку подготовки. Ничего в профиле не изменено.'
        mkdir "$LOCK_DIR" || fail 'Не получилось создать блокировку подготовки.'
        ;;
    esac
  fi
  LOCK_OWNED=1
  printf '%s\n' "$$" > "$LOCK_DIR/pid"
}

verify_browser() {
  [ -x "$CHROME_BIN" ] || return 1
  local actual
  actual="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$CHROME_APP/Contents/Info.plist" 2>/dev/null)" || return 1
  [ "$actual" = "$BROWSER_VERSION" ] || return 1
  /usr/bin/codesign --verify --deep --strict "$CHROME_APP" >> "$LOG_DIR/launch.log" 2>&1 || return 1
}

prepare_browser() {
  if [ -d "$CHROME_APP" ]; then
    verify_browser || fail 'Проверка файлов браузера не пройдена. Распакуйте свежий выпуск в новую папку. Папку Data/Profile сохраните.'
    return
  fi
  printf 'Первый запуск: проверяем и распаковываем браузер. Это может занять несколько минут.\n'
  local actual staging staged_app
  actual="$(/usr/bin/shasum -a 256 "$PAYLOAD")"
  actual="${actual%% *}"
  [ "$actual" = "$EXPECTED_SHA" ] || fail 'Архив браузера повреждён: контрольная сумма не совпадает. Скачайте выпуск повторно.'
  staging="$(/usr/bin/mktemp -d "$DATA_DIR/.runtime-XXXXXXXX")" || fail 'Нет места или прав для подготовки браузера.'
  /usr/bin/ditto -x -k "$PAYLOAD" "$staging" >> "$LOG_DIR/launch.log" 2>&1 || fail "Не получилось распаковать браузер. Подробности в Data/Logs/launch.log. Незавершённые файлы: $staging"
  staged_app="$staging/$SOURCE_ROOT/Google Chrome for Testing.app"
  [ -x "$staged_app/Contents/MacOS/Google Chrome for Testing" ] || fail 'В архиве браузера не найдена программа macOS.'
  /usr/bin/codesign --verify --deep --strict "$staged_app" >> "$LOG_DIR/launch.log" 2>&1 || fail 'macOS не смогла проверить подпись браузера. Установка остановлена, профиль сохранён.'
  mkdir -p "$RUNTIME_DIR"
  mv "$staged_app" "$CHROME_APP" || fail 'Не получилось перенести браузер в Data/Browser.'
  # Временная папка намеренно не удаляется рекурсивно: оригинал браузера уже перенесён.
  rmdir "$staging/$SOURCE_ROOT" "$staging" 2>/dev/null || true
  verify_browser || fail 'После распаковки версия или подпись браузера не прошла проверку.'
}

prepare_profile() {
  mkdir -p "$PROFILE_DIR/Default"
  # Начальные предпочтения записываются только для нового профиля, чужие настройки не заменяются.
  if [ ! -f "$PROFILE_DIR/Default/Preferences" ]; then
    printf '%s\n' '{"intl":{"accept_languages":"en-GB,en","selected_languages":"en-GB,en"},"browser":{"check_default_browser":false}}' > "$PROFILE_DIR/Default/Preferences"
  fi
}

launch_browser() {
  local start_url
  start_url="file://$(encode_path "$PACKAGE_DIR/app/starting.html")"
  printf '%s\n' 'Открываем отдельный браузер. Вход и чаты остаются в его профиле.'
  /usr/bin/open -n -a "$CHROME_APP" --args \
    "--user-data-dir=$PROFILE_DIR" \
    '--no-first-run' '--no-default-browser-check' '--lang=en-GB' \
    "--load-extension=$PACKAGE_DIR/extension" '--new-window' "$start_url" \
    >> "$LOG_DIR/launch.log" 2>&1 || fail 'macOS не разрешила открыть браузер. Проверьте раздел «Если не открылось» в инструкции.'
  printf 'Команда запуска передана macOS. Окно браузера может появиться не сразу.\n'
}

main() {
  require_macos
  case "$PACKAGE_DIR" in
    *,*) fail 'В пути к папке есть запятая. Переименуйте эту папку или перенесите её, например в «Документы/Claude mini», затем повторите запуск.' ;;
  esac
  MAC_ARCH="$(detect_arch)"
  load_runtime_config
  check_system_version
  mkdir -p "$LOG_DIR" || fail 'Перенесите папку выпуска в доступное для записи место, например «Документы».'
  printf '\n[%s] Claude mini %s / %s / macOS %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$PRODUCT_VERSION" "$MAC_ARCH" "$(/usr/bin/sw_vers -productVersion)" >> "$LOG_DIR/launch.log"
  acquire_prepare_lock
  prepare_browser
  prepare_profile
  launch_browser
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
