"""Тестовый Windows CfT: не включается в пользовательские macOS архивы."""
import hashlib
import json
from pathlib import Path
import time
import urllib.request
import zipfile
import sys

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "test-cache"
if len(sys.argv) > 1:
    version = sys.argv[1]
    if not version or any(c not in '0123456789.' for c in version):
        raise RuntimeError('Некорректная версия')
    CACHE = CACHE / version
    with urllib.request.urlopen(f'https://googlechromelabs.github.io/chrome-for-testing/{version}.json', timeout=35) as response:
        STABLE = json.load(response)
    META = {'timestamp': 'version-specific metadata', 'channels': {'Stable': STABLE}}
else:
    META = json.loads((ROOT / "cache" / "official-stable.json").read_text("utf-8"))
    STABLE = META["channels"]["Stable"]
ITEM = next(x for x in STABLE["downloads"]["chrome"] if x["platform"] == "win64")
CACHE.mkdir(exist_ok=True, parents=True)
archive_path = CACHE / "chrome-win64.zip"
if not archive_path.exists():
    partial = CACHE / "chrome-win64.zip.part"
    for attempt in range(5):
        offset = partial.stat().st_size if partial.exists() else 0
        request = urllib.request.Request(ITEM['url'], headers={'Range': f'bytes={offset}-'} if offset else {})
        with urllib.request.urlopen(request, timeout=60) as response:
            if offset and response.status != 206:
                offset = 0
            total = int(response.headers.get('Content-Range', '').split('/')[-1]) if response.status == 206 else int(response.headers.get('Content-Length', 0))
            if response.status == 206 and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                raise RuntimeError('Неверный диапазон докачивания')
            with partial.open('ab' if offset else 'wb') as out:
                done = offset
                last = time.monotonic()
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    done += len(chunk)
                    if time.monotonic() - last >= 15:
                        print(f"win64: {done}/{total} байт", flush=True)
                        last = time.monotonic()
        if total and done == total:
            break
        print(f'Неполное скачивание {done}/{total}; повтор {attempt+1}', flush=True)
    else:
        raise RuntimeError('Пять попыток скачивания остались неполными')
    partial.replace(archive_path)
with archive_path.open("rb") as stream:
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
destination = CACHE / "windows-browser"
destination.mkdir(exist_ok=True)
with zipfile.ZipFile(archive_path) as archive:
    bad = archive.testzip()
    if bad:
        raise RuntimeError(f"Неверный ZIP CRC: {bad}")
    for item in archive.infolist():
        resolved = (destination / item.filename).resolve()
        if not resolved.is_relative_to(destination.resolve()):
            raise RuntimeError(f"Некорректный путь архива: {item.filename}")
    archive.extractall(destination)
exe = destination / "chrome-win64" / "chrome.exe"
if not exe.is_file() or exe.read_bytes()[:2] != b"MZ":
    raise RuntimeError("Не найден ожидаемый PE chrome.exe")
evidence = {"kind": "test-only-not-distributed", "source": ITEM["url"],
            "sourceMetadata": META["timestamp"], "version": STABLE["version"],
            "bytes": archive_path.stat().st_size, "sha256": digest,
            "zipCRC": True, "safePaths": True, "executable": str(exe.resolve())}
(CACHE / "browser-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(evidence, ensure_ascii=False, indent=2), flush=True)
