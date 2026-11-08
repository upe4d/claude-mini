"""Собирает два самостоятельных бесплатных комплекта macOS, не включая Pro и Windows."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import stat
import zipfile

SOURCE = Path(__file__).resolve().parent
OUTPUT = SOURCE.parent
VERSION = "0.14.0"
ROOT = f"Claude-mini-macOS-v{VERSION}"
PLATFORMS = {"mac-arm64": "Apple-Silicon", "mac-x64": "Intel"}


def digest_file(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def runtime_file(item: dict) -> Path:
    # Кэш версии отделён от имени payload: прежние проверенные загрузки не заменяются.
    path = (SOURCE / item.get("cachePath", "cache/" + item["filename"])).resolve()
    assert path.is_relative_to((SOURCE / "cache").resolve())
    return path


def validate_extension() -> dict:
    manifest = json.loads((SOURCE / "extension/manifest.json").read_text(encoding="utf-8"))
    assert manifest["version"] == VERSION
    assert manifest["manifest_version"] == 3
    assert "debugger" in manifest["permissions"] and "privacy" in manifest["permissions"]
    assert not any("<all_urls>" in value for value in manifest.get("host_permissions", []))
    # Исследовательские обработчики не должны попасть в гражданскую сборку.
    forbidden = re.compile(r"(^|/)(research[^/]*|site-observer[^/]*|observation[^/]*|audit[^/]*)$", re.I)
    assert not any(forbidden.search(path.name) for path in (SOURCE / "extension").rglob("*") if path.is_file())
    assert manifest["chrome_url_overrides"]["newtab"] == "workspace.html"
    return manifest


def add_file(archive: zipfile.ZipFile, name: str, content: bytes | Path) -> dict:
    info = zipfile.ZipInfo(f"{ROOT}/{name}", (2026, 11, 7, 12, 0, 0))
    info.create_system = 3
    executable = name.endswith((".command", ".sh"))
    info.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    info.compress_type = zipfile.ZIP_STORED if name.startswith("payload/") else zipfile.ZIP_DEFLATED
    if isinstance(content, Path):
        with archive.open(info, "w", force_zip64=True) as target, content.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                target.write(chunk)
        return {"path": name, "bytes": content.stat().st_size, "sha256": digest_file(content)}
    archive.writestr(info, content)
    return {"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}


def build() -> dict:
    lock = json.loads((SOURCE / "runtime-lock.json").read_text(encoding="utf-8"))
    manifest = validate_extension()
    assert re.fullmatch(r"\d+(\.\d+){3}", lock["version"])
    # Проверка ZIP не заменяет проверку API: Chrome 157 выявил несовместимость расширения.
    proof = json.loads((OUTPUT / "docs/validation/macos/integration-tests.json").read_text(encoding="utf-8"))
    assert proof.get("passed") and proof.get("sourceUnchanged") and not proof.get("errors")
    assert proof.get("browserVersion") == lock["version"], "Нужен тест именно выбранной версии браузера"
    assert all(digest_file(SOURCE / "extension" / name) == value for name, value in proof["sourceHashes"].items()), "Исходники изменились после интеграционного теста"
    for platform in PLATFORMS:
        item = lock["platforms"][platform]
        assert item["url"].startswith(f"https://storage.googleapis.com/chrome-for-testing-public/{lock['version']}/{platform}/")
        assert item["bytes"] == runtime_file(item).stat().st_size
        assert digest_file(runtime_file(item)) == item["sha256"]
        assert item["validation"]["zipCRC"] and item["validation"]["machOArchitecture"]
    env = (
        "# Фиксированные версии и SHA-256 оригинальных браузерных архивов.\n"
        f"PRODUCT_VERSION='{VERSION}'\nBROWSER_VERSION='{lock['version']}'\nMIN_MACOS_MAJOR=13\n"
        f"ARM64_SHA256='{lock['platforms']['mac-arm64']['sha256']}'\n"
        f"X64_SHA256='{lock['platforms']['mac-x64']['sha256']}'\n"
    ).encode("utf-8")
    unused = {"pro.html", "request-code.js", "request-id.js", "portable-guide.js", "guide.css"}
    extension_files = sorted(path for path in (SOURCE / "extension").rglob("*") if path.is_file() and path.name not in unused)
    public_app = ["app/portable.sh", "app/guide.css", "app/guide.js", "app/starting.html"]
    entries: list[tuple[str, bytes | Path]] = [(name, SOURCE / name) for name in public_app]
    entries += [("Запустить.command", SOURCE / "Запустить.command"), ("Диагностика.command", SOURCE / "Диагностика.command"), ("Начните здесь.html", SOURCE / "Начните здесь.html")]
    entries += [(path.relative_to(SOURCE).as_posix(), path) for path in extension_files]
    entries += [("app/runtime.env", env), ("app/runtime-lock.json", SOURCE / "runtime-lock.json"), ("app/Проверка для тестировщика.html", SOURCE / "tester.html"), ("ПРОЧИТАЙТЕ.txt", SOURCE / "README.txt"), ("Источники.txt", SOURCE / "SOURCES.txt")]
    products = []
    for platform, label in PLATFORMS.items():
        runtime = lock["platforms"][platform]
        release = {
            "version": VERSION, "edition": "free", "platform": platform,
            "services": ["claude", "gemini"], "browserVersion": lock["version"],
            "minimumMacOS": runtime["minimumMacOS"], "bundledBrowser": True,
            "proTools": False, "cpuSelection": True,
            "originalRuntimeSha256": runtime["sha256"],
            "nativeMacAcceptance": "pending",
            "liveServiceAccountValidation": "pending",
            "sourceBase": {"version": "0.13.1", "url": "https://cenpad.ru/claude-mini/downloads/Claude-mini-Browser-v0.13.1.zip"},
        }
        output = OUTPUT / f"Claude-mini-macOS-v{VERSION}-{label}.zip"
        records = []
        with zipfile.ZipFile(output, "w", allowZip64=True, compresslevel=7) as archive:
            for name, content in entries:
                if isinstance(content, Path) and content.suffix in {".sh", ".command"}:
                    content = content.read_bytes().replace(b"\r\n", b"\n")
                records.append(add_file(archive, name, content))
            records.append(add_file(archive, "Release.json", json_bytes(release)))
            records.append(add_file(archive, "payload/" + runtime["filename"], runtime_file(runtime)))
            add_file(archive, "Package-files.json", json_bytes({"version": VERSION, "files": records}))
        # Проверяем содержимое уже готового ZIP, а не только исходники сборщика.
        with zipfile.ZipFile(output) as archive:
            assert archive.testzip() is None
            names = archive.namelist()
            assert len(names) == len(set(names))
            assert all(name.startswith(ROOT + "/") and "/../" not in name for name in names)
            assert sum("/payload/" in name for name in names) == 1
            assert not any(name.lower().endswith((".cmd", ".ps1", ".exe", ".dll", ".7z")) for name in names)
            assert not any("/Data/" in name or "/test-cache/" in name or "/tests/" in name for name in names)
            for record in records:
                info = archive.getinfo(f"{ROOT}/{record['path']}")
                assert info.file_size == record["bytes"]
                value = hashlib.sha256()
                with archive.open(info) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        value.update(chunk)
                assert value.hexdigest() == record["sha256"]
                if record["path"].endswith((".command", ".sh")):
                    assert (info.external_attr >> 16) & 0o111 == 0o111
                    assert b"\r" not in archive.read(info)
        sha = digest_file(output)
        output.with_suffix(".zip.sha256").write_text(sha + "  " + output.name + "\n", encoding="ascii")
        products.append({"file": output.name, "bytes": output.stat().st_size, "sha256": sha, "platform": platform, "files": len(records) + 1, "zipCRC": True, "fileHashes": True, "unixExecutableBits": True})
    report = {"passed": True, "version": VERSION, "extensionIDKeyPreserved": manifest["key"] == json.loads((OUTPUT / "windows/extension/manifest.json").read_text(encoding="utf-8"))["key"], "nativeMacAcceptance": "pending", "products": products}
    (SOURCE / "tests/package-results.json").write_bytes(json_bytes(report))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == "__main__":
    build()
