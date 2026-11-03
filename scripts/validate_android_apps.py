"""APK-backed Android smoke check; never confuses emulator boot with app data validation.

Runs in a clean GitHub Actions emulator. It does not modify the scheduled web
collectors or commit extracted records. Only a supplied HTTPS APK with a known
SHA-256 checksum may be installed. A single extracted vote is kept for human
comparison with the original app screen before any full-collection rollout.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification" / "android-apps"
OUT.mkdir(parents=True, exist_ok=True)
TARGETS = {"my1pick", "idolchamp", "mubeat", "coogoong"}


def sh(*cmd, timeout=60):
    return subprocess.run(cmd, cwd=ROOT, timeout=timeout, capture_output=True,
                          text=True, errors="replace")


def adb(*args, timeout=60):
    return sh("adb", *args, timeout=timeout)


def snapshot(name):
    image = OUT / (name + ".png")
    with image.open("wb") as stream:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], cwd=ROOT,
                       check=True, timeout=45, stdout=stream)
    adb("shell", "uiautomator", "dump", "/sdcard/window.xml")
    sh("adb", "pull", "/sdcard/window.xml", str(OUT / (name + ".xml")), timeout=45)


def read_apk(url, expected_sha, dest):
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha or ""):
        raise RuntimeError("SHA256_REQUIRED: 정확한 APK SHA-256 체크섬이 필요합니다")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise RuntimeError("APK_URL_INVALID: HTTPS 직접 APK 주소가 필요합니다")
    req = urllib.request.Request(url, headers={"User-Agent": "VoteAtlas-APK-Validation/1.0"})
    digest = hashlib.sha256()
    written = 0
    with urllib.request.urlopen(req, timeout=45) as response, dest.open("wb") as output:
        final_url = urllib.parse.urlparse(response.geturl())
        if final_url.scheme != "https":
            raise RuntimeError("APK_REDIRECT_INSECURE: HTTPS 이외 리다이렉트 차단")
        while True:
            piece = response.read(1024 * 1024)
            if not piece:
                break
            written += len(piece)
            if written > 250 * 1024 * 1024:
                raise RuntimeError("APK_TOO_LARGE: 250MB 초과")
            digest.update(piece)
            output.write(piece)
    if digest.hexdigest().lower() != expected_sha.lower():
        dest.unlink(missing_ok=True)
        raise RuntimeError("APK_HASH_MISMATCH: 다운로드한 파일의 SHA-256 불일치")
    if written < 1024:
        raise RuntimeError("APK_INVALID: 다운로드 파일이 비정상적으로 작습니다")


def validate_one(app, apk_url, apk_sha):
    name, package = app["id"], app["package"]
    entry = {
        "id": name, "name": app["name"], "package": package,
        "emulator_booted": True, "apk_installed": False, "app_launched": False,
        "vote_extracted": False, "source_compared": False,
        "full_list_collected": False, "status": "APK_REQUIRED",
        "play_store": "https://play.google.com/store/apps/details?id=" + package
    }
    if not apk_url:
        entry["detail"] = "직접 설치할 검증된 APK가 없습니다. Play Store URL은 APK 다운로드 URL이 아닙니다."
        return entry
    if name not in TARGETS:
        entry.update(status="NOT_TARGETED", detail="검증 대상 앱이 아님")
        return entry

    apk = OUT / (name + ".apk")
    try:
        read_apk(apk_url, apk_sha, apk)
        installed = adb("install", "-r", str(apk), timeout=180)
        if installed.returncode != 0 or "Success" not in installed.stdout:
            raise RuntimeError("INSTALL_FAILED: " + (installed.stderr or installed.stdout)[-300:])
        present = adb("shell", "pm", "path", package)
        if not present.stdout.strip().startswith("package:"):
            raise RuntimeError("PACKAGE_MISMATCH: APK의 실제 패키지명이 설정과 다름")
        entry["apk_installed"] = True
        launched = adb("shell", "monkey", "-p", package, "-c",
                       "android.intent.category.LAUNCHER", "1", timeout=50)
        if launched.returncode != 0 or "Events injected: 1" not in launched.stdout:
            raise RuntimeError("LAUNCH_FAILED: 런처 시작이 확인되지 않음")
        entry["app_launched"] = True
        snapshot(name + "-launch")

        collector = sh(sys.executable, "scripts/android_collect.py", "--app", name,
                       "--max-pages", "3", "--max-details", "1", timeout=240)
        entry["collector_log"] = (collector.stdout + "\n" + collector.stderr)[-1600:]
        data = json.loads((ROOT / "dist/data/events.json").read_text())
        source = next((s for s in data.get("sources", []) if s.get("id") == name), {})
        matching = [e for e in data.get("events", [])
                    if e.get("app") == name and e.get("source") == "android"]
        entry["vote_extracted"] = bool(matching) and source.get("state") == "partial"
        if matching:
            # Review candidate, not verified fact. The app screenshot must be
            # compared manually with title, dates, rewards and candidates.
            first = matching[0]
            entry["first_vote_for_review"] = {
                k: first.get(k) for k in
                ("id", "title", "start", "end", "reward", "candidates",
                 "evidence", "source_url", "collected_at")
            }
            entry["status"] = "SOURCE_COMPARISON_REQUIRED"
            entry["detail"] = "실제 화면 추출 후보 1건 확보. 원본 대조 전이므로 전체 수집 미진행."
        else:
            entry["status"] = "VOTE_NOT_EXTRACTED"
            entry["detail"] = source.get("message") or "설치·실행 후에도 유효한 투표 1건을 추출하지 못함"
        try:
            snapshot(name + "-post-collection")
        except Exception as exc:
            entry["snapshot_warning"] = str(exc)[:180]
    except Exception as exc:
        if entry["app_launched"]:
            entry["status"] = "COLLECTION_BLOCKED"
        elif entry["apk_installed"]:
            entry["status"] = "LAUNCH_BLOCKED"
        else:
            entry["status"] = "INSTALL_BLOCKED"
        entry["detail"] = str(exc)[:400]
    finally:
        # Never upload APK binaries to public artifacts.
        apk.unlink(missing_ok=True)
    return entry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", choices=["all", *sorted(TARGETS)], default="all")
    args = parser.parse_args()
    all_apps = json.loads((ROOT / "config/apps.json").read_text())
    apps = [a for a in all_apps if a["id"] in TARGETS]
    boot = adb("shell", "getprop", "sys.boot_completed")
    booted = boot.returncode == 0 and boot.stdout.strip() == "1"
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "emulator_booted": booted,
        "android_version": adb("shell", "getprop", "ro.build.version.release").stdout.strip()
            if booted else None,
        "apps": []
    }
    if not booted:
        report["error"] = "EMULATOR_NOT_BOOTED"
        (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        raise RuntimeError("Emulator failed to boot")
    url = os.getenv("APK_URL", "").strip()
    digest = os.getenv("APK_SHA256", "").strip()
    if args.app == "all" and url:
        raise RuntimeError("단일 APK 입력 시 --app으로 대상 앱 1개를 선택해야 합니다")
    for app in apps:
        if args.app != "all" and app["id"] != args.app:
            continue
        result = validate_one(app, url, digest)
        report["apps"].append(result)
        print(app["name"], result["status"], result.get("detail", ""), flush=True)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    summary = "\n".join(
        "- {}: APK={}, 실행={}, 투표추출={}, 원본대조={}, 상태={}".format(
            e["name"], e["apk_installed"], e["app_launched"],
            e["vote_extracted"], e["source_compared"], e["status"]
        ) for e in report["apps"]
    )
    print("Emulator booted: " + str(booted) + "\n" + summary)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("### Android 앱 검증 (에뮬레이터 ≠ 데이터 성공)\n\n" + summary + "\n")
    # An APK-free run is a successful *status inspection*, not app verification.
    # Never claim source comparison or full collection until independently checked.


if __name__ == "__main__":
    main()
