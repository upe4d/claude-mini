/* Проверяет настоящие функции portable.sh с подставными утилитами macOS. Браузер не запускается. */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const shell = process.env.GIT_BASH || 'C:/Program Files/Git/bin/bash.exe';
const nativeSource = fs.readFileSync(path.join(root, 'app/portable.sh'), 'utf8');
const nativeSha = crypto.createHash('sha256').update(nativeSource).digest('hex');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-macos-launcher-'));
const pkg = path.join(fixture, 'Папка с пробелами #тест');
fs.mkdirSync(path.join(pkg, 'app'), { recursive: true });
fs.mkdirSync(path.join(pkg, 'payload'), { recursive: true });
fs.mkdirSync(path.join(pkg, 'extension'), { recursive: true });
const posix = p => p.replace(/\\/g, '/');
const quote = p => "'" + posix(p).replace(/'/g, "'\\''") + "'";
const nativeTools = [
  '/usr/libexec/PlistBuddy', '/usr/sbin/sysctl', '/usr/bin/sw_vers',
  '/usr/bin/codesign', '/usr/bin/shasum', '/usr/bin/ditto',
  '/usr/bin/open', '/usr/bin/mktemp', '/usr/bin/plutil'
];
let copied = nativeSource;
for (const p of nativeTools) copied = copied.split(p).join('fake_' + path.basename(p));
fs.writeFileSync(path.join(pkg, 'app/portable.sh'), copied, 'utf8');
fs.writeFileSync(path.join(pkg, 'app/runtime.env'), [
  "PRODUCT_VERSION='0.14.0'", "BROWSER_VERSION='157.0.8103.38'", 'MIN_MACOS_MAJOR=13',
  "ARM64_SHA256='" + 'a'.repeat(64) + "'", "X64_SHA256='" + 'b'.repeat(64) + "'", ''
].join('\n'));
for (const arch of ['arm64', 'x64']) fs.writeFileSync(path.join(pkg, `payload/chrome-mac-${arch}.zip`), 'FAKE_PAYLOAD_NOT_A_BROWSER');
fs.writeFileSync(path.join(pkg, 'Начните здесь.html'), '<!doctype html><title>Test</title>');
fs.writeFileSync(path.join(pkg, 'app/starting.html'), '<!doctype html><title>Starting fixture</title>');
const uri = input => 'file://' + [...Buffer.from(input)].map(b => /[a-zA-Z0-9/._~\-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
const script = String.raw`#!/bin/bash
set -euo pipefail
CHECKS=0
pass() { CHECKS=$((CHECKS+1)); printf 'PASS %s\n' "$1"; }
same() { [ "$1" = "$2" ] || { printf 'FAIL %s\nexpected <%s> got <%s>\n' "$3" "$2" "$1" >&2; exit 71; }; pass "$3"; }
expect_fail() {
  local label="$1" text="$2"; shift 2
  if ( "$@" ) > "$TEST_ROOT/failure.out" 2>&1; then printf 'FAIL expected rejection %s\n' "$label" >&2; exit 72; fi
  grep -F "$text" "$TEST_ROOT/failure.out" >/dev/null || { cat "$TEST_ROOT/failure.out" >&2; exit 73; }
  pass "$label"
}
uname() { case "$1" in -s) printf '%s\n' "$FAKE_OS" ;; -m) printf '%s\n' "$FAKE_ARCH" ;; *) command uname "$@" ;; esac; }
fake_sysctl() { printf '%s\n' "$FAKE_ARM"; }
fake_sw_vers() { printf '%s\n' "$FAKE_MACOS"; }
fake_PlistBuddy() { printf '%s\n' "$FAKE_VERSION"; }
fake_codesign() { [ "$FAKE_SIGNATURE" = good ]; }
fake_shasum() { printf '%s  %s\n' "$FAKE_SHA" "$3"; }
fake_mktemp() { command mktemp "$@"; }
fake_ditto() {
  printf 'called\n' >> "$TEST_ROOT/ditto.calls"
  [ "$FAKE_EXTRACT" = good ] || return 1
  mkdir -p "$4/$SOURCE_ROOT/Google Chrome for Testing.app/Contents/MacOS"
  printf '#!/bin/bash\nexit 99\n' > "$4/$SOURCE_ROOT/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  chmod +x "$4/$SOURCE_ROOT/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
}
fake_open() { printf '%s\0' "$@" > "$TEST_ROOT/open.args"; [ "$FAKE_OPEN" = good ]; }
FAKE_OS=Linux; FAKE_ARCH=x86_64; FAKE_ARM=0; FAKE_MACOS=13.7.1
FAKE_VERSION=157.0.8103.38; FAKE_SIGNATURE=good; FAKE_EXTRACT=good; FAKE_OPEN=good
TEST_ROOT="$TEST_ROOT_VALUE"
. "$TEST_ROOT/Папка с пробелами #тест/app/portable.sh"
expect_fail 'wrong OS rejected before changes' 'предназначен для macOS' require_macos
FAKE_OS=Darwin; FAKE_ARM=1
same "$(detect_arch)" arm64 'Rosetta selects physical Apple Silicon'
FAKE_ARM=0; same "$(detect_arch)" x64 'Intel selects x64'
FAKE_ARCH=arm64; same "$(detect_arch)" arm64 'arm64 uname fallback'
FAKE_ARCH=ppc; expect_fail 'unsupported architecture' 'не поддерживается' detect_arch
FAKE_ARCH=x86_64
same "$(encode_path "$TEST_URI_INPUT")" '/%D0%9F%D0%B0%D0%BF%D0%BA%D0%B0%20%D1%81%20%D0%BF%D1%80%D0%BE%D0%B1%D0%B5%D0%BB%D0%B0%D0%BC%D0%B8/%23%3F%25%22%27' 'UTF8 punctuation and whitespace URI encoding'
same "$(encode_path '/a-z_A~b.test/123')" '/a-z_A~b.test/123' 'safe URI bytes preserved'
MAC_ARCH=x64; load_runtime_config
same "$SOURCE_ROOT" chrome-mac-x64 'x64 runtime selection'
same "$PAYLOAD" "$PACKAGE_DIR/payload/chrome-mac-x64.zip" 'payload path retains spaces and Unicode'
MAC_ARCH=arm64; load_runtime_config
same "$SOURCE_ROOT" chrome-mac-arm64 'Apple Silicon runtime selection'
MAC_ARCH=x64; load_runtime_config
FAKE_MACOS=12.7.6; expect_fail 'old macOS refused' 'Нужна macOS 13' check_system_version
FAKE_MACOS=13.7.1; check_system_version; pass 'minimum macOS accepted'
FAKE_MACOS=14.6.1; check_system_version; pass 'newer macOS accepted'
FAKE_MACOS=unknown; expect_fail 'unknown macOS refused' 'определить версию' check_system_version
FAKE_MACOS=13.7.1
mkdir -p "$LOG_DIR"
prepare_profile
grep -F 'en-GB,en' "$PROFILE_DIR/Default/Preferences" >/dev/null; pass 'new profile English preferences'
printf '{"custom":"keep me","sentinel":17}\n' > "$PROFILE_DIR/Default/Preferences"
prepare_profile
same "$(cat "$PROFILE_DIR/Default/Preferences")" '{"custom":"keep me","sentinel":17}' 'existing preferences not overwritten'
acquire_prepare_lock
same "$LOCK_OWNED" 1 'preparation lock ownership recorded'
same "$(cat "$LOCK_DIR/pid")" "$$" 'preparation lock stores process pid'
cleanup; LOCK_OWNED=0
[ ! -e "$LOCK_DIR" ]; pass 'owned preparation lock released'
[ -f "$PROFILE_DIR/Default/Preferences" ]; pass 'cleanup preserves profile'
mkdir "$LOCK_DIR"; printf '%s\n' "$$" > "$LOCK_DIR/pid"
expect_fail 'live competing preparation rejected' 'ещё подготавливается' acquire_prepare_lock
same "$(cat "$LOCK_DIR/pid")" "$$" 'competing lock preserved'
printf '2147483646\n' > "$LOCK_DIR/pid"
acquire_prepare_lock
same "$(cat "$LOCK_DIR/pid")" "$$" 'dead preparation lock recovered'
cleanup; LOCK_OWNED=0
mkdir "$LOCK_DIR"; printf 'garbled\n' > "$LOCK_DIR/pid"
expect_fail 'malformed lock fails without deletion' 'Подготовка уже запущена' acquire_prepare_lock
same "$(cat "$LOCK_DIR/pid")" garbled 'malformed lock untouched'
rm "$LOCK_DIR/pid"; rmdir "$LOCK_DIR"
FAKE_SHA=corrupt
expect_fail 'payload checksum mismatch aborts extraction' 'контрольная сумма не совпадает' prepare_browser
[ ! -e "$TEST_ROOT/ditto.calls" ]; pass 'corrupt archive never extracted'
FAKE_SHA="$EXPECTED_SHA"; prepare_browser
[ -x "$CHROME_BIN" ]; pass 'first preparation installs only fixture executable'
same "$(wc -l < "$TEST_ROOT/ditto.calls" | tr -d ' ')" 1 'first preparation extracts once'
prepare_browser
same "$(wc -l < "$TEST_ROOT/ditto.calls" | tr -d ' ')" 1 'repeat preparation does not reinstall'
FAKE_VERSION=1.2.3
expect_fail 'existing runtime version mismatch fails closed' 'Проверка файлов браузера не пройдена' prepare_browser
FAKE_VERSION="$BROWSER_VERSION"; FAKE_SIGNATURE=bad
expect_fail 'invalid existing signature fails closed' 'Проверка файлов браузера не пройдена' prepare_browser
FAKE_SIGNATURE=good
launch_browser
[ -s "$TEST_ROOT/open.args" ]; pass 'launch records argument boundaries'
FAKE_OPEN=bad
expect_fail 'native open failure is explained' 'не разрешила открыть браузер' launch_browser
FAKE_OPEN=good
same "$(cat "$PROFILE_DIR/Default/Preferences")" '{"custom":"keep me","sentinel":17}' 'all error branches preserve preferences'
main_with_comma() { require_macos() { :; }; PACKAGE_DIR="$TEST_ROOT/with,comma"; main; }
expect_fail 'comma in extension path rejected before preparation' 'В пути к папке есть запятая' main_with_comma
require_macos() { :; }
main
same "$(cat "$PROFILE_DIR/Default/Preferences")" '{"custom":"keep me","sentinel":17}' 'complete launch keeps existing preferences'
cleanup; LOCK_OWNED=0
main
same "$(wc -l < "$TEST_ROOT/ditto.calls" | tr -d ' ')" 1 'complete repeat launch reuses installed runtime'
cleanup; LOCK_OWNED=0
printf '%s\n' "$PACKAGE_DIR" > "$TEST_ROOT/package-posix.txt"
printf '%s\n' "$CHECKS" > "$TEST_ROOT/check-count.txt"
`;
// Только путь TEST_ROOT передаётся через окружение; остальная логика запуска взята из исходника.
const testFile = path.join(fixture, 'launcher-harness.sh');
fs.writeFileSync(testFile, script, 'utf8');
const env = { ...process.env, TEST_ROOT_VALUE: posix(fixture), TEST_URI_INPUT: '/Папка с пробелами/#?%"\'', CHERE_INVOKING: '1' };
const syntax = cp.spawnSync(shell, ['--noprofile', '--norc', '-n', posix(path.join(root, 'app/portable.sh'))], { encoding: 'utf8', env });
assert.equal(syntax.status, 0, syntax.stderr);
for (const command of ['Запустить.command', 'Диагностика.command']) {
  const commandSyntax = cp.spawnSync(shell, ['--noprofile', '--norc', '-n', posix(path.join(root, command))], { encoding: 'utf8', env });
  assert.equal(commandSyntax.status, 0, command + ': ' + commandSyntax.stderr);
}
const run = cp.spawnSync(shell, ['--noprofile', '--norc', posix(testFile)], { encoding: 'utf8', env, timeout: 90000, maxBuffer: 1024 * 1024 });
const report = { passed: false, scope: 'Git Bash simulation of actual portable.sh functions; not macOS execution or Gatekeeper validation', sourceSha256: nativeSha, source: 'app/portable.sh', fixture, syntax: syntax.status === 0, stdout: run.stdout, stderr: run.stderr, exitCode: run.status, checks: [] };
try {
  assert.equal(run.status, 0, run.stdout + '\n' + run.stderr);
  report.checks = run.stdout.split(/\r?\n/).filter(s => s.startsWith('PASS ')).map(s => s.slice(5));
  const packagePosix = fs.readFileSync(path.join(fixture, 'package-posix.txt'), 'utf8').trim();
  const args = fs.readFileSync(path.join(fixture, 'open.args')).toString('utf8').split('\0');
  assert.deepEqual(args, [ '-n', '-a', packagePosix + '/Data/Browser/Google Chrome for Testing.app', '--args', '--user-data-dir=' + packagePosix + '/Data/Profile', '--no-first-run', '--no-default-browser-check', '--lang=en-GB', '--load-extension=' + packagePosix + '/extension', '--new-window', uri(packagePosix + '/app/starting.html'), '' ]);
  report.checks.push('native open keeps every browser flag and Unicode path as one argument');
  assert.equal(fs.readFileSync(path.join(pkg, 'Data/Profile/Default/Preferences'), 'utf8'), '{"custom":"keep me","sentinel":17}\n');
  assert.equal(fs.readFileSync(path.join(root, 'app/portable.sh'), 'utf8'), nativeSource);
  report.checks.push('test never changes native source or real profile');
  report.passed = true;
} finally {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts/launcher-simulation-tests.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, scope: report.scope, fixture, artifact: path.join(root, 'artifacts/launcher-simulation-tests.json') }, null, 2));
