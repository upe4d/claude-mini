"""Сохраняет оригинальные macOS ZIP CfT, не распаковывая исполняемые файлы."""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
from pathlib import Path
import plistlib
import struct
import sys
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
SOURCE = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
PINNED = sys.argv[1] if len(sys.argv) > 1 else None
if PINNED and any(c not in '0123456789.' for c in PINNED):
    raise RuntimeError('Некорректная версия')
CACHE = ROOT / 'cache' / PINNED if PINNED else ROOT / 'cache'


def download(item):
    platform = item["platform"]
    path = CACHE / f"chrome-{platform}.zip"
    partial = path.with_suffix(".zip.part")
    print(f"Получение {platform}: {item['url']}", flush=True)
    if not path.exists():
        for attempt in range(5):
            offset = partial.stat().st_size if partial.exists() else 0
            request = urllib.request.Request(item['url'], headers={'Range': f'bytes={offset}-'} if offset else {})
            with urllib.request.urlopen(request, timeout=60) as response:
                if offset and response.status != 206:
                    offset = 0
                total = int(response.headers.get('Content-Range', '').split('/')[-1]) if response.status == 206 else int(response.headers.get('Content-Length', 0))
                if response.status == 206 and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                    raise RuntimeError('Неверный диапазон докачивания')
                with partial.open('ab' if offset else 'wb') as output:
                    done = offset
                    last = time.monotonic()
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                        done += len(chunk)
                        if time.monotonic() - last > 15:
                            print(f"{platform}: {done}/{total} байт", flush=True)
                            last = time.monotonic()
            if total and total == done:
                break
            print(f'{platform}: неполное скачивание {done}/{total}, попытка {attempt+1}', flush=True)
        else:
            raise RuntimeError(f'{platform}: скачивание не завершено за пять попыток')
        partial.replace(path)
    digest = hashlib.file_digest(path.open("rb"), "sha256").hexdigest()
    with zipfile.ZipFile(path) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"CRC поврежден: {bad}")
        plist_path = f"chrome-{platform}/Google Chrome for Testing.app/Contents/Info.plist"
        info = plistlib.loads(archive.read(plist_path))
        executable = info["CFBundleExecutable"]
        entry = f"chrome-{platform}/Google Chrome for Testing.app/Contents/MacOS/{executable}"
        with archive.open(entry) as stream:
            header = stream.read(32)
        magic, cpu = struct.unpack_from("<II", header)
        if magic != 0xFEEDFACF:
            raise RuntimeError(f"Не ожидаемый Mach-O: {platform}: {magic:x}")
        expected_cpu = 0x100000C if platform == "mac-arm64" else 0x1000007
        if cpu != expected_cpu:
            raise RuntimeError(f"Не та архитектура: {platform}: {cpu:x}")
        symlinks = sum(1 for x in archive.infolist() if ((x.external_attr >> 16) & 0o170000) == 0o120000)
    result = dict(item, filename=path.name, cachePath=path.relative_to(ROOT).as_posix(), sha256=digest, bytes=path.stat().st_size,
                  version=info["CFBundleShortVersionString"], minimumMacOS=info["LSMinimumSystemVersion"],
                  bundlePath=f"chrome-{platform}/Google Chrome for Testing.app",
                  executable=executable, machoCPU=hex(cpu), symlinks=symlinks,
                  validation={"zipCRC": True, "machOArchitecture": True, "signatureOnMac": "pending"})
    print(f"Проверено {platform}: {result['bytes']} байт, sha256={digest}", flush=True)
    return result


def main():
    CACHE.mkdir(exist_ok=True, parents=True)
    selected_source = f'https://googlechromelabs.github.io/chrome-for-testing/{PINNED}.json' if PINNED else SOURCE
    with urllib.request.urlopen(selected_source, timeout=35) as response:
        selected_data = json.load(response)
    if PINNED:
        stable = selected_data
        snapshot = ROOT / 'cache' / 'official-stable.json'
        if snapshot.exists():
            data = json.loads(snapshot.read_text('utf-8'))
        else:
            # Чистый клон получает только метаданные Stable; payload остаётся закреплённым.
            with urllib.request.urlopen(SOURCE, timeout=35) as response:
                data = json.load(response)
            snapshot.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
        (CACHE / 'official-version.json').write_text(json.dumps(selected_data, indent=2) + '\n', encoding='utf-8')
    else:
        data = selected_data
        (ROOT / "cache" / "official-stable.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        stable = data["channels"]["Stable"]
    wanted = [x for x in stable["downloads"]["chrome"] if x["platform"] in {"mac-arm64", "mac-x64"}]
    if len(wanted) != 2:
        raise RuntimeError("В официальном Stable нет двух macOS архитектур")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        items = list(pool.map(download, wanted))
    if any(x["version"] != stable["version"] for x in items):
        raise RuntimeError("Версия Info.plist не совпадает с Stable JSON")
    lock = {"schema": 1, "source": selected_source, "currentStableSourceTimestamp": data["timestamp"],
            "channel": "Compatible pinned" if PINNED else "Stable", "version": stable["version"], "revision": stable["revision"],
            "currentStableSource": SOURCE, "currentStableVersion": data['channels']['Stable']['version'],
            "selection": 'Existing extension compatibility checked on Windows fixtures; native Mac pending' if PINNED else 'Current official Stable',
            "sha256Provenance": "Calculated locally from complete HTTPS downloads; not an upstream published signature",
            "runtimeKind": "Chrome for Testing", "autoUpdates": False,
            "platforms": {x["platform"]: x for x in items}}
    lock_path = ROOT / 'runtime-lock.json'
    if PINNED and lock_path.exists():
        current_lock=json.loads(lock_path.read_text('utf-8'))
        backup=ROOT/'cache'/f'runtime-lock-{current_lock["version"]}.json'
        if not backup.exists():
            backup.write_bytes(lock_path.read_bytes())
    lock_path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("runtime-lock.json готов", flush=True)


if __name__ == "__main__":
    main()
