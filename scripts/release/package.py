"""Stage, seal and verify public Spark packages. Python 3.11+, standard library only.

Staging is NOT release acceptance. Sealing requires successful test and real native
startup receipts bound to this commit and these exact binary hashes. No game data,
working directory, environment variables or local test logs enter public assets.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys
import tarfile
import tomllib
import zipfile

GATES = frozenset(json.loads(Path(__file__).with_name("required-gates.json").read_text(encoding="utf-8")))
SOURCE_ROOTS = {"src", "src-tauri", "crates", "scripts", "tests", "docs",
                "examples", "public", ".github"}
FORBIDDEN_PARTS = {".git", ".local", ".research", ".toolchain", "node_modules", "artifacts", "tools", "preserved",
                   "target", "dist", "__pycache__"}
FORBIDDEN_SUFFIXES = {".map", ".yelo", ".iso", ".xiso", ".xbe", ".exe", ".dll",
                      ".pdb", ".sqlite3", ".db", ".pem", ".pfx", ".p12", ".key"}
REPOSITORY = "LeftoverProductionsTeam/Project-Guilty-Spark"
BUNDLE_MARKER = b"__TAURI_BUNDLE_TYPE_VAR_"


def need(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(file):
    return json.loads(Path(file).read_text(encoding="utf-8"))


def write_json(file, value):
    with Path(file).open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def safe_name(name):
    need(isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,160}", name),
         "Unsafe release asset name")
    return name


def public_source_path(name):
    parts = PurePosixPath(name).parts
    need(parts and not name.startswith(("/", "\\")) and "\\" not in name and ":" not in name,
         "Absolute or ambiguous source path")
    need(not any(p in FORBIDDEN_PARTS or p in {".", ".."} or p.startswith(".env") for p in parts),
         "Private source directory or secret filename")
    need(PurePosixPath(name).suffix.lower() not in FORBIDDEN_SUFFIXES, "Private/binary source payload")
    need(len(parts) == 1 or parts[0] in SOURCE_ROOTS, "Source root is not audited for distribution")


def source_info(repo, commit, preview):
    repo = Path(repo).resolve()
    need(re.fullmatch(r"[0-9a-f]{40}", commit), "Use an exact full source commit")
    need(git(repo, "rev-parse", "HEAD").decode().strip() == commit, "Checked-out commit differs")
    need(not git(repo, "status", "--porcelain"), "Commit all public source changes before packaging")
    package = read_json(repo / "package.json")
    config = read_json(repo / "src-tauri/tauri.conf.json")
    cargo = tomllib.loads((repo / "Cargo.toml").read_text())
    version = package["version"]
    need(re.fullmatch(r"\d+\.\d+\.\d+", version), "Expected a numeric application version")
    need(config["version"] == cargo["workspace"]["package"]["version"] == version,
         "Frontend, Cargo and Tauri versions differ")
    lock = tomllib.loads((repo / "Cargo.lock").read_text())
    own = {p["name"]: p["version"] for p in lock["package"]
           if p["name"] in {"guilty-spark", "spark-core", "spark-steam-bridge"}}
    need(len(own) == 3 and set(own.values()) == {version}, "Cargo lock is stale")
    need(isinstance(preview, int) and 1 <= preview <= 9999, "Preview number is outside 1..9999")
    # A new resource/sidecar must be explicitly added to the portable allowlist.
    need(not config["bundle"].get("resources") and not config["bundle"].get("externalBin"),
         "Portable packaging must be updated for configured resources or sidecars")
    return {"schemaVersion": 1, "applicationVersion": version, "sourceCommit": commit,
            "sourceTree": git(repo, "rev-parse", "HEAD^{tree}").decode().strip(),
            "repository": REPOSITORY, "releaseTag": f"v{version}-preview.{preview}"}


def pe_machine(data):
    need(len(data) >= 128 and data[:2] == b"MZ", "Not a Windows executable")
    offset = struct.unpack_from("<I", data, 60)[0]
    need(64 <= offset <= len(data) - 24 and data[offset:offset + 4] == b"PE\0\0", "Invalid PE header")
    return struct.unpack_from("<H", data, offset + 4)[0]


def bundle_payload(app, kind):
    # Tauri restores UNK in target/release after making each package.
    # Match the complete upstream marker exactly once; never normalize other bytes.
    need(kind in {b"NSS", b"DEB", b"APP"}, "Unknown bundle kind")
    need(app.count(BUNDLE_MARKER) == 1 and app.count(BUNDLE_MARKER + b"UNK") == 1,
         "Unknown or ambiguous Tauri bundle marker")
    return app.replace(BUNDLE_MARKER + b"UNK", BUNDLE_MARKER + kind, 1)


def nsis_payload(app):
    need(pe_machine(app) == 0x8664, "Application must be x64")
    return bundle_payload(app, b"NSS")


def windows_payload(expected_file, installed_file):
    app, installed = Path(expected_file).read_bytes(), Path(installed_file).read_bytes()
    expected = nsis_payload(app)
    need(installed == expected, "NSIS payload differs beyond the exact Tauri UNK-to-NSS marker")
    return {"portableExecutableSha256": sha(app), "installedExecutableSha256": sha(installed),
            "bundleMarkerRewrite": "UNK-to-NSS", "rewrittenBytes": 3,
            "otherPayloadBytesIdentical": True}


def elf_x64(data):
    need(len(data) >= 64 and data[:6] == b"\x7fELF\x02\x01" and
         struct.unpack_from("<H", data, 18)[0] == 62, "Not a genuine Linux x64 ELF")


def source_archive(repo, commit, destination):
    data = git(repo, "archive", "--format=zip", commit)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        files = [i for i in archive.infolist() if not i.is_dir()]
        need(len(files) <= 4096, "Source inventory exceeds bound")
        need(sum(i.file_size for i in files) <= 128 * 1024**2, "Source archive exceeds bound")
        verify_source_checksums(archive)
        names = set()
        for item in files:
            public_source_path(item.filename)
            need(item.filename.casefold() not in names, "Source path collision")
            names.add(item.filename.casefold())
            need((item.external_attr >> 16) & 0o170000 != 0o120000, "Source link refused")
            need(archive.read(item) == git(repo, "show", f"{commit}:{item.filename}"),
                 "Source archive differs from committed blob")
        need(archive.comment == commit.encode(), "Git archive identity is missing")
        need(archive.testzip() is None, "Source archive CRC failure")
    Path(destination).write_bytes(data)
    return len(files)


def verify_source_checksums(archive):
    manifests = {"SOURCE_SHA256SUMS.txt", "SOURCE_MANIFEST_SHA256.txt"}
    members = {i.filename for i in archive.infolist() if not i.is_dir()}
    need(manifests <= members, "Committed source checksum manifests are missing")
    text = archive.read("SOURCE_SHA256SUMS.txt")
    need(text == archive.read("SOURCE_MANIFEST_SHA256.txt"), "Source checksum manifests differ")
    records = {}
    for line in text.decode("utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("  ", 1)
        need(len(parts) == 2 and re.fullmatch(r"[0-9a-f]{64}", parts[0]), "Invalid source checksum row")
        checksum, name = parts
        need(name not in records and name in members - manifests, "Unexpected source checksum member")
        need(sha(archive.read(name)) == checksum, "Committed source checksum mismatch: " + name)
        records[name] = checksum
    need(set(records) == members - manifests, "Source checksum inventory is incomplete")


def one_file(directory, pattern):
    files = sorted(Path(directory).glob(pattern))
    need(len(files) == 1, f"Expected one {pattern}, found {len(files)}")
    need(files[0].is_file() and not files[0].is_symlink(), "Bundle file is not a regular file")
    return files[0]


def deb_binary(file):
    data = Path(file).read_bytes()
    need(data[:8] == b"!<arch>\n", "Not a Debian ar archive")
    at, members = 8, {}
    while at < len(data):
        need(at + 60 <= len(data) and data[at + 58:at + 60] == b"`\n", "Invalid Debian member")
        name = data[at:at + 16].decode("ascii").strip().rstrip("/")
        size = int(data[at + 48:at + 58])
        need(size >= 0 and at + 60 + size <= len(data) and name not in members, "Invalid Debian span")
        members[name] = data[at + 60:at + 60 + size]
        at += 60 + size + size % 2
    need(members.get("debian-binary") == b"2.0\n", "Debian format marker missing")
    controls = [b for n, b in members.items() if n.startswith("control.tar.")]
    payloads = [b for n, b in members.items() if n.startswith("data.tar.")]
    need(len(controls) == len(payloads) == 1, "Debian control or data payload missing")
    with tarfile.open(fileobj=io.BytesIO(controls[0])) as archive:
        control = next((m for m in archive if m.name.lstrip("./") == "control"), None)
        need(control is not None, "Debian control is missing")
        text = archive.extractfile(control).read().decode()
        need(re.search(r"^Architecture: amd64$", text, re.M), "Debian architecture is not amd64")
    with tarfile.open(fileobj=io.BytesIO(payloads[0])) as archive:
        executable = next((m for m in archive if m.name.lstrip("./") == "usr/bin/GuiltySpark"), None)
        need(executable is not None and executable.isfile(), "Debian application executable missing")
        app = archive.extractfile(executable).read()
        elf_x64(app)
    return app, text


def stage(repo, commit, preview, platform, output, build_root=None):
    repo, output = Path(repo).resolve(), Path(output).resolve()
    build_root = Path(build_root).resolve() if build_root else repo / "target/release"
    info = source_info(repo, commit, preview)
    need(platform in {"windows-x64", "linux-x64"}, "Unsupported release platform")
    output.mkdir(parents=True, exist_ok=False)
    prefix = f"Project_Guilty_Spark_{info['applicationVersion']}_{platform.replace('-', '_')}"
    artifacts = []

    def attach(source, name, kind):
        safe_name(name)
        need(source.is_file() and not source.is_symlink(), "Release input is not a regular file")
        shutil.copyfile(source, output / name)
        artifacts.append({"file": name, "kind": kind})

    binary = build_root / ("GuiltySpark.exe" if platform == "windows-x64" else "GuiltySpark")
    app = binary.read_bytes()
    if platform == "windows-x64":
        need(pe_machine(app) == 0x8664, "Application must be x64")
        setup = one_file(build_root / "bundle/nsis", f"*_{info['applicationVersion']}_x64-setup.exe")
        setup_bytes = setup.read_bytes()
        need(pe_machine(setup_bytes) in {0x14c, 0x8664} and b"NullsoftInst" in setup_bytes[:1024**2],
             "Not a genuine NSIS installer")
        attach(setup, prefix + "_Setup.exe", "nsis-installer")
        build_info = {**info, "platform": platform, "executableSha256": sha(app),
                      "requires": ["Windows 10/11 x64", "Microsoft Edge WebView2 Runtime"],
                      "bundledHaloContent": False}
        readme = (f"Project Guilty Spark {info['applicationVersion']} preview\n"
                  f"Source commit: {commit}\n\nRun GuiltySpark.exe on Windows 10/11 x64.\n"
                  "Microsoft Edge WebView2 Runtime is required and is not installed by this ZIP.\n"
                  "https://developer.microsoft.com/microsoft-edge/webview2/\n\n"
                  "Connect your own Halo installations and matching tools in Settings. No Halo game,\n"
                  "map, SDK, Steamworks SDK or optional Steam bridge is bundled.\n"
                  "See https://github.com/" + REPOSITORY + "/releases for notes and checksums.\n"
                  "Unsigned preview: Windows may show an unknown-publisher warning.\n")
        with zipfile.ZipFile(output / (prefix + "_Portable.zip"), "x", zipfile.ZIP_DEFLATED) as archive:
            for name, data in [("GuiltySpark.exe", app), ("LICENSE", (repo / "LICENSE").read_bytes()),
                               ("THIRD_PARTY_NOTICES.md", (repo / "THIRD_PARTY_NOTICES.md").read_bytes()),
                               ("README.txt", readme.encode()),
                               ("BUILD_INFO.json", (json.dumps(build_info, indent=2) + "\n").encode())]:
                archive.writestr(name, data)
        artifacts.append({"file": prefix + "_Portable.zip", "kind": "portable-zip"})
        source = f"Project_Guilty_Spark_{info['applicationVersion']}_{commit[:12]}_Source.zip"
        source_count = source_archive(repo, commit, output / source)
        artifacts.append({"file": source, "kind": "source-zip"})
        compatibility = "Windows 10/11 x64; separate WebView2 Runtime; unsigned preview."
    else:
        elf_x64(app)
        image = one_file(build_root / "bundle/appimage", "*.AppImage")
        image_data = image.read_bytes()
        elf_x64(image_data)
        need(image_data[8:11] == b"AI\x02", "Not a type-2 AppImage")
        deb = one_file(build_root / "bundle/deb", "*.deb")
        deb_app, control = deb_binary(deb)
        need(deb_app == bundle_payload(app, b"DEB"), "Debian payload differs beyond the Tauri bundle marker")
        need(f"Version: {info['applicationVersion']}\n" in control, "Debian version differs")
        attach(image, prefix + ".AppImage", "appimage")
        attach(deb, prefix + ".deb", "debian")
        source_count = None
        compatibility = ("Built on Ubuntu 22.04 x64 / glibc 2.35, WebKitGTK 4.1. "
                         "Xvfb native startup only; Windows game hooks, executable launchers and "
                         "Steam/MCC/CE/OpenCE/Chupathingy gameplay are unverified on Linux. "
                         "AppImage extraction can be used when FUSE is unavailable.")
    for item in artifacts:
        data = (output / item["file"]).read_bytes()
        item.update(bytes=len(data), sha256=sha(data))
    manifest = {**info, "platform": platform, "executableSha256": sha(app),
                "compatibility": compatibility, "sourceArchiveFiles": source_count,
                "artifacts": artifacts, "verification": {"complete": False},
                "bundledHaloContent": False, "publiclyPublished": False,
                "workflow": {"runId": os.getenv("GITHUB_RUN_ID"),
                             "runAttempt": os.getenv("GITHUB_RUN_ATTEMPT")}}
    if platform == "windows-x64":
        manifest["installedExecutableSha256"] = sha(nsis_payload(app))
    else:
        manifest["debianExecutableSha256"] = sha(bundle_payload(app, b"DEB"))
        manifest["appImageExecutableSha256"] = sha(bundle_payload(app, b"APP"))
    write_json(output / "candidate.json", manifest)
    return manifest


def verify_artifacts(directory, manifest):
    directory = Path(directory)
    need(manifest["repository"] == REPOSITORY and manifest["bundledHaloContent"] is False,
         "Release repository or content scope differs")
    need(re.fullmatch(r"[0-9a-f]{40}", manifest["sourceCommit"]), "Invalid source identity")
    need(re.fullmatch(r"v\d+\.\d+\.\d+-preview\.[1-9]\d{0,3}", manifest["releaseTag"]), "Invalid preview tag")
    need(manifest["releaseTag"].startswith("v" + manifest["applicationVersion"] + "-preview."),
         "Release tag and application version differ")
    names = set()
    for item in manifest["artifacts"]:
        name = safe_name(item["file"])
        need(name.casefold() not in names, "Duplicate release asset")
        names.add(name.casefold())
        file = directory / name
        need(file.is_file() and not file.is_symlink(), "Release member missing or linked")
        data = file.read_bytes()
        need(0 < len(data) <= 256 * 1024**2 and len(data) == item["bytes"] and sha(data) == item["sha256"],
             f"Release bytes/checksum mismatch: {name}")
        if item["kind"] == "portable-zip":
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                need(set(archive.namelist()) == {"GuiltySpark.exe", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.txt", "BUILD_INFO.json"}
                     and len(archive.infolist()) == 5 and archive.testzip() is None, "Portable contents differ")
                app = archive.read("GuiltySpark.exe")
                need(pe_machine(app) == 0x8664 and sha(app) == manifest["executableSha256"], "Portable app differs")
                need(sha(nsis_payload(app)) == manifest["installedExecutableSha256"],
                     "NSIS payload identity differs from the audited Tauri bundle rewrite")
                build = json.loads(archive.read("BUILD_INFO.json"))
                need(build["sourceCommit"] == manifest["sourceCommit"] and
                     build["applicationVersion"] == manifest["applicationVersion"] and
                     build["executableSha256"] == sha(app), "Portable build identity differs")
        elif item["kind"] == "nsis-installer":
            need(pe_machine(data) in {0x14c, 0x8664} and b"NullsoftInst" in data[:1024**2], "Invalid NSIS asset")
        elif item["kind"] == "appimage":
            elf_x64(data)
            need(data[8:11] == b"AI\x02", "Invalid AppImage asset")
        elif item["kind"] == "debian":
            app, _ = deb_binary(file)
            need(sha(app) == manifest["debianExecutableSha256"], "Debian executable differs")
            need(app.count(BUNDLE_MARKER + b"DEB") == 1 and app.count(BUNDLE_MARKER) == 1,
                 "Debian bundle marker differs")
            original = app.replace(BUNDLE_MARKER + b"DEB", BUNDLE_MARKER + b"UNK", 1)
            need(sha(original) == manifest["executableSha256"] and
                 sha(bundle_payload(original, b"APP")) == manifest["appImageExecutableSha256"],
                 "Linux payload differs beyond the Tauri bundle marker")
        elif item["kind"] == "source-zip":
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                need(archive.comment == manifest["sourceCommit"].encode() and archive.testzip() is None,
                     "Source identity/CRC differs")
                verify_source_checksums(archive)
                for member in archive.infolist():
                    if not member.is_dir():
                        public_source_path(member.filename)
        else:
            raise ValueError("Unknown release payload kind")
    kinds = {a["kind"] for a in manifest["artifacts"]}
    need(kinds == ({"nsis-installer", "portable-zip", "source-zip"} if manifest["platform"] == "windows-x64"
                   else {"appimage", "debian"}), "Release platform is incomplete")


def seal(directory, gates_file, startup_file, installer_file=None, installed_startup_file=None):
    directory = Path(directory)
    manifest = read_json(directory / "candidate.json")
    verify_artifacts(directory, manifest)
    gates, startup = read_json(gates_file), read_json(startup_file)
    for receipt in (gates, startup):
        need(receipt["sourceCommit"] == manifest["sourceCommit"] and receipt["complete"] is True,
             "Acceptance receipt is incomplete or belongs to another commit")
    need(gates["platform"] == manifest["platform"] and
         {g["id"] for g in gates["gates"]} == GATES and
         len(gates["gates"]) == len(GATES) and all(g["exitCode"] == 0 for g in gates["gates"]),
         "Full release test gates have not passed")
    need(startup["executableSha256"] == manifest["executableSha256"] and
         startup["applicationVersion"] == manifest["applicationVersion"] and startup["mockedIpc"] is False and
         startup.get("workspaceReady") is True,
         "Native startup did not test this application")
    verification = {"complete": True, "testGates": gates["gates"],
                    "nativeStartup": startup, "testReceiptSha256": sha(Path(gates_file).read_bytes())}
    if manifest["platform"] == "windows-x64":
        need(installer_file and installed_startup_file, "Windows needs installation and installed-app startup")
        install, installed = read_json(installer_file), read_json(installed_startup_file)
        setup = next(a for a in manifest["artifacts"] if a["kind"] == "nsis-installer")
        need(install["complete"] is True and install["installerSha256"] == setup["sha256"] and
             install["portableExecutableSha256"] == manifest["executableSha256"] and
             install["installedExecutableSha256"] == manifest["installedExecutableSha256"] and
             install["bundleMarkerRewrite"] == "UNK-to-NSS" and install["rewrittenBytes"] == 3 and
             install["otherPayloadBytesIdentical"] is True, "Installer payload was not verified")
        need(installed["complete"] is True and installed["mockedIpc"] is False and
             installed["sourceCommit"] == manifest["sourceCommit"] and
             installed["executableSha256"] == manifest["installedExecutableSha256"] and
             installed.get("workspaceReady") is True and
             installed["applicationVersion"] == manifest["applicationVersion"], "Installed app did not launch")
        verification["installer"] = install
        verification["installedNativeStartup"] = installed
    else:
        need(startup.get("appImageLaunched") is True and startup.get("debianBinaryLaunched") is True,
             "Both genuine Linux packages must launch")
        need(startup.get("appImageExecutableSha256") == manifest["appImageExecutableSha256"] and
             startup.get("debianExecutableSha256") == manifest["debianExecutableSha256"],
             "Linux startup payload identities differ")
    manifest["verification"] = verification
    name = f"Project_Guilty_Spark_{manifest['applicationVersion']}_{manifest['platform'].replace('-', '_')}_manifest.json"
    write_json(directory / name, manifest)
    rows = [(a["file"], a["sha256"]) for a in manifest["artifacts"]]
    rows.append((name, sha((directory / name).read_bytes())))
    sums = directory / f"SHA256SUMS-{manifest['platform']}.txt"
    sums.write_text("".join(f"{digest}  {file}\n" for file, digest in rows), encoding="utf-8", newline="\n")
    (directory / "candidate.json").unlink()  # Only our own unsealed metadata; never a source or previous build.
    verify(directory)
    return manifest


def verify(directory):
    directory = Path(directory)
    file = one_file(directory, "*_manifest.json")
    manifest = read_json(file)
    need(manifest["verification"]["complete"] is True, "Package is not sealed")
    verify_artifacts(directory, manifest)
    sums = directory / f"SHA256SUMS-{manifest['platform']}.txt"
    expected = {a["file"]: a["sha256"] for a in manifest["artifacts"]}
    expected[file.name] = sha(file.read_bytes())
    rows = [line.split("  ", 1) for line in sums.read_text().splitlines()]
    need(len(rows) == len(expected) and {name: digest for digest, name in rows} == expected, "Checksum index differs")
    need({p.name for p in directory.iterdir()} == set(expected) | {sums.name}, "Unexpected public package content")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    info = sub.add_parser("identity")
    stage_parser = sub.add_parser("stage")
    for target in (info, stage_parser):
        target.add_argument("--repo", default=".")
        target.add_argument("--commit", required=True)
        target.add_argument("--preview", type=int, default=1)
    stage_parser.add_argument("--platform", choices=["windows-x64", "linux-x64"], required=True)
    stage_parser.add_argument("--output", required=True)
    stage_parser.add_argument("--build-root", help="Explicit exported build folder; no compiler cache is retained")
    seal_parser = sub.add_parser("seal")
    seal_parser.add_argument("directory")
    seal_parser.add_argument("--gates", required=True)
    seal_parser.add_argument("--startup", required=True)
    seal_parser.add_argument("--installer")
    seal_parser.add_argument("--installed-startup")
    sub.add_parser("verify").add_argument("directory")
    payload_parser = sub.add_parser("windows-payload")
    payload_parser.add_argument("expected")
    payload_parser.add_argument("installed")
    args = parser.parse_args()
    if args.command == "identity":
        result = source_info(args.repo, args.commit, args.preview)
    elif args.command == "stage":
        result = stage(args.repo, args.commit, args.preview, args.platform, args.output, args.build_root)
    elif args.command == "seal":
        result = seal(args.directory, args.gates, args.startup, args.installer, args.installed_startup)
    elif args.command == "windows-payload":
        result = windows_payload(args.expected, args.installed)
    else:
        result = verify(args.directory)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
