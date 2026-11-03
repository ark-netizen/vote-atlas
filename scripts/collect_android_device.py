"""Collect one IdolChamp vote from a real Android phone over USB ADB.

No server, cloud DB, vote submission or write to dist/data/events.json.
Requires Android platform tools (adb), Python and an already installed IdolChamp
from the official Play Store. Tesseract OCR is optional for image-only text.
Usage: python scripts/collect_android_device.py --app idolchamp
"""
from __future__ import annotations
import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import android_collect
from android_evidence import enrich_android_observation

APP_ID = "idolchamp"


def shell(*parts, timeout=50, raw=False):
    p = subprocess.run(parts, capture_output=True, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError(
            "ADB_COMMAND_FAILED: " +
            p.stderr.decode("utf-8", "replace")[-250:]
        )
    return p.stdout if raw else p.stdout.decode("utf-8", "replace")


def ensure_one_physical_device():
    if not shutil.which("adb"):
        raise RuntimeError("ADB_NOT_FOUND: Android platform-tools / adb가 필요합니다.")
    shell("adb", "start-server")
    result = shell("adb", "devices", "-l")
    connected = [line.split()[0] for line in result.splitlines()[1:]
                 if re.search(r"\sdevice(?:\s|$)", line)]
    if len(connected) != 1:
        raise RuntimeError(
            f"ONE_USB_PHONE_REQUIRED: 연결된 Android 장치 {len(connected)}개. "
            "휴대전화 1대만 USB로 연결하고 USB 디버깅을 허용해주세요."
        )
    if shell("adb", "shell", "getprop", "ro.kernel.qemu").strip() == "1":
        raise RuntimeError("EMULATOR_REJECTED: 아이돌챔프는 에뮬레이터를 차단합니다.")
    serial = connected[0]
    model = shell("adb", "shell", "getprop", "ro.product.model").strip()
    return serial, model


def capture_snapshot(tag, destination):
    """Store locally for manual comparison; never upload screenshots."""
    (destination / (tag + ".png")).write_bytes(
        shell("adb", "exec-out", "screencap", "-p", timeout=50, raw=True)
    )
    shell("adb", "shell", "uiautomator", "dump", "/sdcard/vote-atlas-local.xml", timeout=50)
    xml = shell("adb", "shell", "cat", "/sdcard/vote-atlas-local.xml", timeout=50)
    if "<hierarchy" in xml:
        xml = xml[xml.index("<hierarchy"):]
    (destination / (tag + ".xml")).write_text(xml, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", choices=[APP_ID], default=APP_ID)
    parser.add_argument("--max-pages", type=int, default=3)
    parser.add_argument("--max-details", type=int, default=1)
    args = parser.parse_args()
    when = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = ROOT / "verification" / "android" / APP_ID / ("physical-" + when)
    out.mkdir(parents=True, exist_ok=True)
    report = {
        "app": APP_ID, "timestamp_utc": when, "device_type": "physical",
        "connected": False, "apk_installed": False, "app_launched": False,
        "vote_list_opened": False, "vote_extracted": False,
        "source_compared": False, "full_list_collected": False,
        "extracted_count": 0, "error": None,
        "output_dir": str(out.relative_to(ROOT)),
    }
    observations = []
    parsed = []
    try:
        serial, model = ensure_one_physical_device()
        report.update(connected=True, device_model=model,
                      device_serial_masked=(serial[:3] + "…"))
        apps = json.loads((ROOT / "config" / "apps.json").read_text(encoding="utf-8"))
        app = next(x for x in apps if x["id"] == APP_ID)
        package = app["package"]
        installed = shell("adb", "shell", "pm", "path", package)
        if "package:" not in installed:
            raise RuntimeError(
                "APP_NOT_INSTALLED: 실제 휴대전화의 Google Play에서 "
                "아이돌챔프를 설치한 뒤 다시 실행해주세요."
            )
        report["apk_installed"] = True
        shell("adb", "shell", "monkey", "-p", package,
              "-c", "android.intent.category.LAUNCHER", "1")
        capture_snapshot("01-launch", out)
        focused = shell("adb", "shell", "dumpsys", "activity", "activities", timeout=60)
        report["app_launched"] = package in focused
        if not report["app_launched"]:
            raise RuntimeError("APP_LAUNCH_NOT_VERIFIED: 포그라운드 실행 미확인")
        # android_collect.collect navigates only read-only list/detail screens.
        # Save raw detail callbacks even if parser cannot identify periods.
        parsed = android_collect.collect(
            app, max_pages=max(1, args.max_pages),
            max_details=max(1, args.max_details),
            detail_callback=observations.append
        )
        report["vote_list_opened"] = bool(observations or parsed)
        report["vote_extracted"] = bool(parsed)
        report["extracted_count"] = len(parsed)
    except Exception as exc:
        report["error"] = str(exc)[:500]
    finally:
        if report["connected"]:
            try:
                capture_snapshot("02-after-collection", out)
            except Exception as exc:
                report["snapshot_error"] = str(exc)[:250]
        enriched = [
            enrich_android_observation(
                record, screenshot_file=str((out / "02-after-collection.png").relative_to(ROOT))
            ) for record in observations
        ]
        (out / "events.json").write_text(
            json.dumps({
                "app": APP_ID, "source": "physical_android_ui",
                "source_compared": False, "lineup_complete": False,
                "events": parsed, "structured_events": enriched
            }, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (out / "report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if observations:
            (out / "raw_observations.json").write_text(
                json.dumps(observations, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    if report["error"]:
        sys.exit(2)
    if not report["vote_extracted"]:
        sys.exit(3)


if __name__ == "__main__":
    main()
