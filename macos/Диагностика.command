#!/bin/bash
# Отчёт для тестирования содержит только состояние запуска, без cookies, паролей и содержимого профиля.
set -euo pipefail
umask 077
PACKAGE_DIR="$(cd -P "$(dirname "$0")" && pwd)"
if [ "$(uname -s)" != Darwin ]; then
  printf 'Диагностика предназначена для macOS.\n' >&2
  exit 1
fi
mkdir -p "$PACKAGE_DIR/Data/Logs"
REPORT="$PACKAGE_DIR/Data/Logs/Проверка-macOS-$(date -u '+%Y%m%d-%H%M%S').txt"
{
  printf 'Claude mini: диагностика запуска macOS\n'
  printf 'Дата UTC: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'macOS: %s\n' "$(/usr/bin/sw_vers -productVersion)"
  printf 'Архитектура процесса: %s\n' "$(uname -m)"
  printf 'Apple Silicon: %s\n' "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || printf '0')"
  if [ -f "$PACKAGE_DIR/app/runtime.env" ]; then
    . "$PACKAGE_DIR/app/runtime.env"
    printf 'Выпуск программы: %s\nВерсия браузера в комплекте: %s\n' "$PRODUCT_VERSION" "$BROWSER_VERSION"
  fi
  printf 'Свободное место (КиБ): %s\n' "$(df -k "$PACKAGE_DIR" | awk 'END { print $4 }')"
  printf 'Папка доступна для записи: '
  if [ -w "$PACKAGE_DIR" ]; then printf 'да\n'; else printf 'нет\n'; fi
  printf 'Профиль создан: '
  if [ -d "$PACKAGE_DIR/Data/Profile/Default" ]; then printf 'да\n'; else printf 'нет\n'; fi
  printf 'Файлы профиля и содержимое чатов не читаются.\n'
  APP="$PACKAGE_DIR/Data/Browser/Google Chrome for Testing.app"
  printf 'Браузер распакован: '
  if [ -d "$APP" ]; then
    printf 'да\n'
    printf 'Версия распакованного браузера: '
    /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist" 2>/dev/null || printf 'не удалось прочитать\n'
    printf 'Проверка подписи файлов: '
    if /usr/bin/codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then printf 'пройдена\n'; else printf 'не пройдена\n'; fi
  else
    printf 'нет (запустите Запустить.command)\n'
  fi
  printf 'Расширение присутствует: '
  if [ -f "$PACKAGE_DIR/extension/manifest.json" ]; then printf 'да\n'; else printf 'нет\n'; fi
  printf '\nЧто проверить вручную:\n'
  printf '1. Появилось ли окно отдельного браузера?\n2. Открывается ли рабочее место расширения?\n3. Сохраняется ли выбор после перезапуска?\n4. Совпадают ли показания открытой вкладки с выбранными?\n5. Есть ли сообщения в предпросмотре экспорта текущего чата?\n'
  printf '\nПришлите этот файл и текст ошибки. Не отправляйте папку Data/Profile.\n'
} > "$REPORT"
printf 'Готово: %s\nВ Finder выбран файл, который можно передать разработчику.\n' "$REPORT"
/usr/bin/open -R "$REPORT"
