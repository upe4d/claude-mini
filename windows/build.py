"""Собирает Windows Free 0.14.1 из проверенных исходников и трёх прежних payload."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
import zipfile

VERSION = "0.14.1"
PREFIX = f"Claude-mini-Browser-v{VERSION}/"
BASE_SHA = "3f932320cad59ffe13165a290baf85979f7f4f16173e668e595992cab6c94c58"
PINS = {
    "chrome": "a4e0d57245e167e98a9d465af1e3774d2b4ec9f04e483d19bcd97a6f63cf46dd",
    "edge": "cd17adf14736b6eaa04076e6f9658a35f74562e69d474c34b667f5515231791b",
    "brave": "2c937c91f5061fb1034097c932112b06f429d5bdd08bc5e32921b88609d011e7",
}
ROOT_FILES = ("Setup.cmd", "Launch.cmd", "Начните здесь.html", "ПРОЧИТАЙТЕ.txt", "Browser-sources.txt", "Release.json")
FORBIDDEN_PARTS = {"profile", "profiles", "data", "tests", "artifacts", "__pycache__", ".git", "node_modules"}
FORBIDDEN_SUFFIXES = {".pyc", ".log", ".zip", ".7z", ".sqlite", ".db", ".pem", ".pfx", ".key"}


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def document(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def relative_name(value: str) -> str:
    # В квитанции и ZIP используются только канонические относительные POSIX-пути.
    if not isinstance(value, str) or not value or "\\" in value or ":" in value or "\0" in value:
        raise RuntimeError("Некорректный путь файла в проверке")
    path = PurePosixPath(value)
    if path.is_absolute() or path.as_posix() != value or any(part in {"", ".", ".."} for part in value.split("/")):
        raise RuntimeError("Некорректный путь файла в проверке: " + value)
    return value


def collect_sources(source: Path) -> dict[str, bytes]:
    source = source.resolve(strict=True)
    files = [source / name for name in ROOT_FILES]
    for folder in ("app", "extension"):
        directory = source / folder
        if directory.is_symlink() or (hasattr(directory, "is_junction") and directory.is_junction()) or not directory.is_dir():
            raise RuntimeError("Отсутствует обычная папка исходников: " + folder)
        members = sorted(directory.rglob("*"))
        for member in members:
            if member.is_symlink() or (hasattr(member, "is_junction") and member.is_junction()):
                raise RuntimeError("Ссылка недопустима в исходниках: " + str(member.relative_to(source)))
        files.extend(member for member in members if member.is_file())
    snapshots: dict[str, bytes] = {}
    folded = set()
    for file in files:
        name = relative_name(file.relative_to(source).as_posix())
        if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(source):
            raise RuntimeError("Отсутствует обычный файл: " + name)
        if any(part.casefold() in FORBIDDEN_PARTS for part in PurePosixPath(name).parts) or file.suffix.casefold() in FORBIDDEN_SUFFIXES:
            raise RuntimeError("Лишний файл в исходниках: " + name)
        if name.casefold() in folded:
            raise RuntimeError("Повторяющийся Windows-путь: " + name)
        folded.add(name.casefold())
        snapshots[name] = file.read_bytes()
    if not any(name.startswith("app/") for name in snapshots) or not any(name.startswith("extension/") for name in snapshots):
        raise RuntimeError("Служебные папки исходников пусты")
    return snapshots


def validate_proof(source: Path, snapshots: dict[str, bytes], proof: dict) -> dict[str, str]:
    if proof.get("passed") is not True:
        raise RuntimeError("Нужна успешная проверка Windows-кандидата")
    recorded = proof.get("sourceHashes")
    if not isinstance(recorded, dict) or not recorded:
        raise RuntimeError("В проверке отсутствуют хеши исходников")
    actual = {name: hashlib.sha256(data).hexdigest() for name, data in snapshots.items()}
    missing = sorted(set(actual) - set(recorded))
    if missing:
        raise RuntimeError("Проверка не покрывает упаковываемые исходники: " + ", ".join(missing))
    source = source.resolve(strict=True)
    folded = set()
    for name, expected in recorded.items():
        relative_name(name)
        if name.casefold() in folded or not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise RuntimeError("Некорректная контрольная сумма исходника: " + name)
        folded.add(name.casefold())
        file = source / name
        if not file.resolve().is_relative_to(source) or not file.is_file() or file.is_symlink():
            raise RuntimeError("Некорректный путь проверенного исходника: " + name)
        # Для упаковываемых файлов проверяется тот же снимок байтов, который пойдёт в ZIP.
        measured = actual.get(name) or digest(file)
        if measured != expected:
            raise RuntimeError("Исходники изменились после проверки: " + name)
    return actual


def validate_metadata(snapshots: dict[str, bytes]) -> dict:
    manifest = json.loads(snapshots["extension/manifest.json"].decode("utf-8-sig"))
    if manifest.get("version") != VERSION or manifest.get("manifest_version") != 3:
        raise RuntimeError("Версия расширения отличается от выпуска")
    runtime = json.loads(snapshots["app/runtimes.json"].decode("utf-8-sig"))
    browsers = runtime.get("browsers", [])
    if runtime.get("productVersion") != VERSION or len(browsers) != 3 or {item["id"]: item["sha256"] for item in browsers} != PINS:
        raise RuntimeError("Проверенные браузеры изменились")
    release = json.loads(snapshots["Release.json"].decode("utf-8-sig"))
    if release.get("version") != VERSION or release.get("edition") != "free" or release.get("platform") != "windows" or release.get("channel") != "prerelease" or set(release.get("services", [])) != {"claude", "gemini"}:
        raise RuntimeError("Некорректные метаданные тестового Windows-выпуска")
    return runtime


def zip_entry(path: str, stored: bool = False) -> zipfile.ZipInfo:
    relative_name(path)
    entry = zipfile.ZipInfo(PREFIX + path, date_time=(2026, 11, 8, 12, 0, 0))
    entry.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
    entry.create_system = 3
    entry.external_attr = (stat.S_IFREG | 0o644) << 16
    return entry


def validate_archive(archive: zipfile.ZipFile, hashes: dict[str, str]) -> None:
    names = archive.namelist()
    required = {PREFIX + name for name in hashes} | {PREFIX + "Package-files.json"}
    if len(names) != len(set(names)) or set(names) != required:
        raise RuntimeError("Состав готового ZIP не совпадает с Package-files.json")
    if archive.testzip() is not None:
        raise RuntimeError("Повреждён готовый архив")
    manifest = json.loads(archive.read(PREFIX + "Package-files.json").decode("utf-8"))
    if manifest != {"version": VERSION, "sha256": hashes}:
        raise RuntimeError("Некорректный Package-files.json")
    if {name for name in hashes if name.startswith("payload/")} != {f"payload/{browser}.zip" for browser in PINS}:
        raise RuntimeError("В комплекте должны быть ровно три браузера")
    for name, expected in hashes.items():
        relative_name(name)
        with archive.open(PREFIX + name) as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                raise RuntimeError("Хеш файла не совпадает: " + name)


def build_package(source: Path, proof_path: Path, base_archive: Path, output: Path, result_path: Path | None = None) -> dict:
    source, proof_path, base_archive = source.resolve(strict=True), proof_path.resolve(strict=True), base_archive.resolve(strict=True)
    output = output.resolve()
    if output.exists():
        raise RuntimeError("Выходной файл уже существует: " + output.name)
    if not output.parent.is_dir():
        raise RuntimeError("Сначала создайте папку выходного архива")
    if output == base_archive or output == proof_path or output.is_relative_to(source):
        raise RuntimeError("Выходной архив должен находиться вне исходников и входных файлов")
    snapshots = collect_sources(source)
    proof = json.loads(proof_path.read_text(encoding="utf-8-sig"))
    source_hashes = validate_proof(source, snapshots, proof)
    runtime = validate_metadata(snapshots)
    if digest(base_archive) != BASE_SHA:
        raise RuntimeError("Исходный полный архив 0.13.1 не прошёл проверку")
    hashes = dict(source_hashes)
    sizes = {item["id"]: item["size"] for item in runtime["browsers"]}
    # Временный ZIP не выдаётся за готовый: имя результата появляется после полной проверки.
    with tempfile.NamedTemporaryFile(prefix=".mini-0.14.1-", suffix=".tmp", dir=output.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(base_archive) as original, zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7, allowZip64=True) as archive:
            for name, data in snapshots.items():
                archive.writestr(zip_entry(name), data)
            for browser, expected in PINS.items():
                name = f"payload/{browser}.zip"
                matches = [info for info in original.infolist() if info.filename.endswith("/" + name)]
                if len(matches) != 1 or matches[0].file_size != sizes[browser]:
                    raise RuntimeError("Неоднозначный или повреждённый исходный payload: " + browser)
                measured = hashlib.sha256()
                with original.open(matches[0]) as src, archive.open(zip_entry(name, True), "w", force_zip64=True) as dst:
                    for chunk in iter(lambda: src.read(1024 * 1024), b""):
                        measured.update(chunk)
                        dst.write(chunk)
                if measured.hexdigest() != expected:
                    raise RuntimeError("Изменился payload " + browser)
                hashes[name] = expected
            archive.writestr(zip_entry("Package-files.json"), document({"version": VERSION, "sha256": hashes}))
        with zipfile.ZipFile(temporary_path) as archive:
            validate_archive(archive, hashes)
        temporary_path.rename(output)
    finally:
        temporary_path.unlink(missing_ok=True)
    sha = digest(output)
    output.with_suffix(output.suffix + ".sha256").write_text(sha + "  " + output.name + "\n", encoding="ascii")
    result = {"passed": True, "file": output.name, "version": VERSION, "bytes": output.stat().st_size, "sha256": sha, "files": len(hashes) + 1, "payloadsUnchanged": PINS, "sourceHashes": source_hashes, "inputProof": proof_path.name, "liveAccountAcceptance": "pending"}
    destination = result_path or output.with_suffix(output.suffix + ".package-results.json")
    destination.write_bytes(document(result))
    print(json.dumps({key: value for key, value in result.items() if key not in {"sourceHashes", "payloadsUnchanged"}}, ensure_ascii=False, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parent, help="Папка Windows-исходников; по умолчанию папка этого build.py")
    parser.add_argument("--base-archive", type=Path, required=True, help="Оригинальный полный ZIP Windows 0.13.1 с тремя браузерами")
    parser.add_argument("--output", type=Path, required=True, help="Имя нового ZIP вне папки Windows-исходников")
    parser.add_argument("--proof", type=Path, required=True, help="Успешная QA-квитанция с sourceHashes для каждого исходника")
    args = parser.parse_args()
    build_package(args.source, args.proof, args.base_archive, args.output)
