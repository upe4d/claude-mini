"""Независимая проверка готовых ZIP: исходники, ссылки, права и отсутствие исследовательских данных."""
from __future__ import annotations

import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import stat
from urllib.parse import unquote, urlsplit
import zipfile

SOURCE = Path(__file__).resolve().parents[1]
OUTPUT = SOURCE.parent
ROOT = "Claude-mini-macOS-v0.14.0/"
EXPECTED_ID = "jnbpljkmhjfhjhmbkeneinfnohebdopg"
CHECKS: list[str] = []


def require(condition: bool, label: str):
    if not condition:
        raise AssertionError(label)
    CHECKS.append(label)


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def member_digest(archive: zipfile.ZipFile, member: str) -> str:
    with archive.open(member) as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"src", "href"} and value:
                self.refs.append(value)


def relative_links(archive: zipfile.ZipFile):
    names = set(archive.namelist())
    count = 0
    for name in names:
        if not name.endswith(".html"):
            continue
        parser = References()
        parser.feed(archive.read(name).decode("utf-8"))
        for value in parser.refs:
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            destination = posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(parsed.path)))
            require(destination in names, f"relative link exists: {name.removeprefix(ROOT)} -> {value}")
            count += 1
    return count


def verify_one(label: str, platform: str):
    path = OUTPUT / f"Claude-mini-macOS-v0.14.0-{label}.zip"
    checksum = digest(path)
    require(path.with_suffix(".zip.sha256").read_text(encoding="ascii").split()[0] == checksum, f"{label}: outer checksum matches sidecar")
    source_manifest = json.loads((OUTPUT / "windows/extension/manifest.json").read_text(encoding="utf-8"))
    aliases = {
        "app/runtime-lock.json": "runtime-lock.json",
        "app/Проверка для тестировщика.html": "tester.html",
        "ПРОЧИТАЙТЕ.txt": "README.txt",
        "Источники.txt": "SOURCES.txt",
    }
    runtime_lock = json.loads((SOURCE / "runtime-lock.json").read_text(encoding="utf-8"))
    runtime_item = runtime_lock["platforms"][platform]
    runtime_source = SOURCE / runtime_item.get("cachePath", "cache/" + runtime_item["filename"])
    require(runtime_source.resolve().is_relative_to((SOURCE / "cache").resolve()), f"{label}: runtime source stays inside build cache")
    source_compared = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == 47 and len(names) == len(set(names)), f"{label}: exactly 47 unique members")
        require(archive.testzip() is None, f"{label}: all ZIP CRC values valid")
        require(all(name.startswith(ROOT) and not (PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts or "\\" in name) for name in names), f"{label}: one safe relative package root")
        forbidden = re.compile(r"(^|/)(?:Data|Profile|tests|test-cache|cache|__pycache__|\.git|Research|AI-Handoff)(?:/|$)|(?:\.cmd|\.ps1|\.exe|\.dll|\.7z|\.pyc)$|/(?:research[^/]*|observation[^/]*|site-observer[^/]*|audit[^/]*|pro\.html|request-id\.js|request-code\.js)$", re.I)
        require(not any(forbidden.search(name) for name in names), f"{label}: no Windows binaries, Pro/research, personal profile or test cache")
        payload = [name for name in names if "/payload/" in name]
        require(payload == [ROOT + f"payload/chrome-{platform}.zip"], f"{label}: exactly one runtime for correct architecture")
        require(all(stat.S_ISREG(info.external_attr >> 16) for info in archive.infolist()), f"{label}: outer archive has regular files only")
        for command in ["Запустить.command", "Диагностика.command", "app/portable.sh"]:
            member = ROOT + command
            require(stat.S_IMODE(archive.getinfo(member).external_attr >> 16) == 0o755, f"{label}: executable permission 0755 on {command}")
            require(archive.read(member).startswith(b"#!/bin/bash\n") and b"\r" not in archive.read(member), f"{label}: Bash shebang and LF on {command}")
        manifest = json.loads(archive.read(ROOT + "Package-files.json"))
        require(manifest["version"] == "0.14.0", f"{label}: file manifest version")
        records = manifest["files"]
        require({ROOT + record["path"] for record in records} == set(names) - {ROOT + "Package-files.json"}, f"{label}: file manifest covers every non-self member")
        for record in records:
            member = ROOT + record["path"]
            require(archive.getinfo(member).file_size == record["bytes"] and member_digest(archive, member) == record["sha256"], f"{label}: file hash {record['path']}")
            relative = record["path"]
            if relative in {"Release.json", "app/runtime.env"}:
                continue
            source = runtime_source if relative.startswith("payload/") else SOURCE / aliases.get(relative, relative)
            require(source.is_file(), f"{label}: actual final source exists for {relative}")
            if relative.startswith("payload/"):
                require(digest(source) == record["sha256"], f"{label}: runtime identical to complete official HTTPS source download")
            else:
                expected = source.read_bytes()
                if relative.endswith((".command", ".sh")):
                    expected = expected.replace(b"\r\n", b"\n")
                require(archive.read(member) == expected, f"{label}: packaged {relative} matches current frozen source")
            source_compared.append(relative)
        extension = json.loads(archive.read(ROOT + "extension/manifest.json"))
        key = extension["key"]
        hash_prefix = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
        extension_id = "".join(chr(ord("a") + int(digit, 16)) for digit in hash_prefix)
        require(extension_id == EXPECTED_ID and key == source_manifest["key"], f"{label}: original extension key and ID retained")
        require(extension["version"] == "0.14.0" and extension["chrome_url_overrides"]["newtab"] == "workspace.html", f"{label}: correct extension version and new-tab workplace")
        guide = archive.read(ROOT + "app/guide.js").decode("utf-8")
        require("chrome-extension://" + EXPECTED_ID + "/workspace.html" in guide and "/home.html" not in guide, f"{label}: manual workspace URL uses correct ID and existing page")
        lock = json.loads(archive.read(ROOT + "app/runtime-lock.json"))
        release = json.loads(archive.read(ROOT + "Release.json"))
        require(lock["version"] == release["browserVersion"] == "156.0.8078.47", f"{label}: final browser is compatibility-tested 156.0.8078.47 rather than incompatible 157")
        require(release["edition"] == "free" and release["services"] == ["claude", "gemini"] and release["platform"] == platform and release["cpuSelection"] and not release["proTools"], f"{label}: metadata matches free Claude + Gemini capabilities")
        require(release["nativeMacAcceptance"] == "pending" and release["liveServiceAccountValidation"] == "pending", f"{label}: native Mac and live-account status not misrepresented")
        runtime = lock["platforms"][platform]
        require(runtime["sha256"] == release["originalRuntimeSha256"] and member_digest(archive, payload[0]) == runtime["sha256"], f"{label}: native runtime source hash matches release pin")
        env = archive.read(ROOT + "app/runtime.env").decode("utf-8")
        require("PRODUCT_VERSION='0.14.0'" in env and f"BROWSER_VERSION='{lock['version']}'" in env and "MIN_MACOS_MAJOR=13" in env and all(item["sha256"] in env for item in lock["platforms"].values()), f"{label}: generated runtime environment has expected pins")
        links = relative_links(archive)
        readme = archive.read(ROOT + "ПРОЧИТАЙТЕ.txt").decode("utf-8")
        main_guide = archive.read(ROOT + "Начните здесь.html").decode("utf-8")
        require(all(text in readme for text in ["Запустить.command", "Claude или Gemini", "Браузер уже внутри архива", "Python, Node.js и установленный Chrome", "Нативный запуск на Mac", "ещё требуют проверки"]), f"{label}: plain instructions explain standalone runtime and pending native test")
        require(all(text in main_guide for text in ["Keep it", "⌘", "macOS 13", "Intel", "Apple Silicon", "WebRTC", "Загрузить распакованное расширение"]), f"{label}: guide covers Mac keys, extension install and browser confirmation")
        require(not any(text in main_guide for text in ["Setup.cmd", "Launch.cmd", "Ctrl + T", "C:\\Users", "установлена автоматически"]), f"{label}: ordinary Mac guide has no wrong Windows launch steps")
        return {"file": path.name, "bytes": path.stat().st_size, "sha256": checksum, "members": len(names), "relativeLinks": links, "currentSourceCompared": len(source_compared), "extensionId": extension_id, "platform": platform}


report = {"passed": False, "scope": "Independent read-only review of finished macOS ZIP files on Windows; not native macOS execution", "products": [], "checks": CHECKS}
try:
    report["products"] = [verify_one("Apple-Silicon", "mac-arm64"), verify_one("Intel", "mac-x64")]
    launcher = json.loads((SOURCE / "artifacts/launcher-simulation-tests.json").read_text(encoding="utf-8"))
    require(launcher["passed"] and launcher["sourceSha256"] == digest(SOURCE / "app/portable.sh"), "launcher simulation is for the exact final native source")
    report["passed"] = True
except Exception as error:
    report["error"] = repr(error)
    raise
finally:
    (SOURCE / "artifacts/final-delivery-review.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"passed": report["passed"], "checks": len(CHECKS), "products": report["products"]}, ensure_ascii=False, indent=2))
