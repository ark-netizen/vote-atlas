"""Actual IdolChamp install/launch/vote-list attempt on a clean free GitHub Android emulator.

Path A: try the stock Play Store first (it may demand account login).
Path B: install F-Droid-signed Aurora Store and attempt its anonymous mode,
        which can download a Play Store APK without any user's credentials.
Path C: optional HTTPS direct APK + SHA256 supplied via workflow_dispatch.
No vote submissions, payments, personal accounts or external DB writes.
Only this app's separate JSON and evidence are saved; dist/data/events.json is untouched.
"""
from __future__ import annotations
import hashlib
import json
import os
import re
import subprocess
import shutil
import tempfile
import zipfile
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification" / "android" / "idolchamp"
OUT.mkdir(parents=True, exist_ok=True)
APP = "com.nwz.ichampclient"
STORE = "com.aurora.store"
AURORA_URL = "https://f-droid.org/repo/com.aurora.store_76.apk"
MIRROR_XAPK_URL = "https://d.apkpure.com/b/XAPK/com.nwz.ichampclient?version=latest"
# Published APK signing SHA-1 (not archive SHA-1). Verify using apksigner before
# installing any Android code downloaded from a third-party APK mirror.
IDOLCHAMP_SIGNER_SHA1 = "be9fa7b3daed0af57c9ee089b935e77e3bd0e05c"
report = {
    "app": "idolchamp", "package": APP, "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    "booted": False, "aurora_installed": False, "apk_installed": False,
    "app_launched": False, "vote_list_opened": False, "vote_extracted": False,
    "source_compared": False, "full_list_collected": False, "extracted_count": 0,
    "steps": [], "errors": [], "source_method": None,
    "results_json": "verification/android/idolchamp/events.json",
}

def note(step, status, detail=""):
    entry = {"step": step, "status": status, "detail": str(detail)[:250]}
    report["steps"].append(entry)
    print("IDOLCHAMP", step, status, str(detail)[:180], flush=True)

def run(*args, timeout=70, binary=False, check=False):
    p = subprocess.run(args, cwd=ROOT, capture_output=True,
                       timeout=timeout, check=check)
    if binary:
        return p.stdout
    return p.stdout.decode("utf-8", "replace") + "\n" + p.stderr.decode("utf-8", "replace")

def adb(*args, timeout=70, binary=False):
    return run("adb", *args, timeout=timeout, binary=binary)

def installed(pkg):
    return "package:" in adb("shell", "pm", "path", pkg)

def screen(tag):
    """Capture actual PNG + XML for each state, and print concise visible labels."""
    (OUT / (tag + ".png")).write_bytes(adb("exec-out", "screencap", "-p", binary=True))
    adb("shell", "uiautomator", "dump", "/sdcard/va-current.xml", timeout=45)
    raw = adb("shell", "cat", "/sdcard/va-current.xml", timeout=45)
    xml = raw[raw.find("<?xml"):] if "<?xml" in raw else raw[raw.find("<hierarchy"):]
    (OUT / (tag + ".xml")).write_text(xml, encoding="utf-8")
    nodes = []
    try:
        for node in ET.fromstring(xml).iter("node"):
            label = (node.attrib.get("text") or node.attrib.get("content-desc") or "").strip()
            bounds = [int(x) for x in re.findall(r"\d+", node.attrib.get("bounds", ""))]
            if label and len(bounds) == 4:
                nodes.append({"text": label[:160], "bounds": bounds,
                              "clickable": node.attrib.get("clickable") == "true"})
    except ET.ParseError:
        pass
    # Log only UI label snippets; never any user account or voting action.
    excerpt = " | ".join(n["text"] for n in nodes[:20])
    print("SCREEN", tag, excerpt[:1250], flush=True)
    return nodes

def tap(nodes, options):
    """Tap a clearly labeled UI node; never a payment, vote or registration button."""
    for option in options:
        for n in nodes:
            if n["text"].strip().casefold() == option.casefold():
                x1, y1, x2, y2 = n["bounds"]
                adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
                time.sleep(3)
                note("click", "OK", option)
                return True
    return False

def wait_package(pkg, attempts=10, delay=5):
    for _ in range(attempts):
        if installed(pkg):
            return True
        time.sleep(delay)
    return False

def fetch_apk(url, dest, *, max_bytes, expected_sha=None):
    if not url.startswith("https://"):
        raise ValueError("HTTPS_REQUIRED")
    if expected_sha is not None and not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha):
        raise ValueError("SHA256_REQUIRED")
    sha = hashlib.sha256()
    total = 0
    req = urllib.request.Request(url, headers={"User-Agent": "VoteAtlas-Android-Probe/1.0"})
    with urllib.request.urlopen(req, timeout=55) as response, dest.open("wb") as file:
        if not response.geturl().startswith("https://"):
            raise ValueError("INSECURE_REDIRECT")
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk: break
            total += len(chunk)
            if total > max_bytes: raise ValueError("APK_TOO_LARGE")
            sha.update(chunk)
            file.write(chunk)
    result = sha.hexdigest()
    if total < 2048 or (expected_sha and result.lower() != expected_sha.lower()):
        raise ValueError("APK_SIZE_OR_SHA256_MISMATCH")
    return {"sha256": result, "bytes": total}

def install_apk(path, expected_package):
    # Check embedded package name before installing, when aapt is available.
    try:
        meta = run("aapt", "dump", "badging", str(path), timeout=30)
        match = re.search(r"^package: name='([^']+)'", meta, re.MULTILINE)
        if match and match.group(1) != expected_package:
            raise ValueError("PACKAGE_ID_MISMATCH:" + match.group(1))
    except FileNotFoundError:
        pass
    outcome = adb("install", "-r", str(path), timeout=220)
    if "Success" not in outcome or not installed(expected_package):
        raise RuntimeError("APK_INSTALL_FAILED: " + outcome[-350:])
    return True

def playstore_attempt():
    # Actual Play Store app listing (not just an emulator boot check).
    note("play_store_listing", "STARTED")
    outcome = adb("shell", "am", "start", "-a", "android.intent.action.VIEW",
                  "-d", "market://details?id=" + APP, timeout=40)
    time.sleep(8)
    nodes = screen("01-playstore")
    if installed(APP):
        report["source_method"] = "google_play"
        report["apk_installed"] = True
        note("play_store_install", "OK")
        return True
    if any(re.search(r"sign in|로그인|add account|계정", x["text"], re.I) for x in nodes):
        note("play_store_install", "ACCOUNT_REQUIRED", "Google Play sign-in screen; no credentials used")
    else:
        note("play_store_install", "NOT_INSTALLED", outcome[-150:])
    return False

def aurora_attempt():
    apk = OUT / "aurora-install.apk"
    try:
        note("aurora_download", "STARTED", "F-Droid signed Aurora Store 4.8.4 (76)")
        source = fetch_apk(AURORA_URL, apk, max_bytes=25*1024*1024)
        note("aurora_download", "OK", source["sha256"][:24] + " / " + str(source["bytes"]) + " bytes")
        install_apk(apk, STORE)
        report["aurora_installed"] = True
        note("aurora_install", "OK")
    except Exception as exc:
        report["errors"].append("AURORA_INSTALL:" + str(exc)[:300])
        note("aurora_install", "BLOCKED", exc)
        return False
    finally:
        apk.unlink(missing_ok=True)
    try:
        adb("shell", "am", "force-stop", STORE)
        adb("shell", "monkey", "-p", STORE, "-c",
            "android.intent.category.LAUNCHER", "1", timeout=45)
        time.sleep(8)
        # Follow only visible onboarding labels. No private Google login,
        # charging, voting, purchasing, or blind-coordinate guessing.
        onboarding = [
            ["Next", "다음", "Continue", "계속"],
            ["Next", "다음", "Continue", "계속", "Get started", "시작하기"],
            ["Finish", "완료", "Start", "시작", "Get started", "Let's go"],
            ["Anonymous", "Anonymous login", "익명", "익명 로그인"],
        ]
        for i in range(10):
            nodes = screen("02-aurora-%02d" % i)
            if installed(APP): break
            if any(re.search(r"access denied|vpn or tor|too many requests|접근이 거부", n["text"], re.I) for n in nodes):
                note("aurora_auth", "BLOCKED", "Anonymous authentication service denied runner IP")
                break
            if any("Anonymous" in n["text"] or "익명" in n["text"] for n in nodes):
                if tap(nodes, ["Anonymous", "Anonymous login", "익명", "익명 로그인"]):
                    time.sleep(6)
                    continue
            if any(re.search(r"sign in with google|google account|Google 계정", n["text"], re.I) for n in nodes):
                note("aurora_auth", "GOOGLE_LOGIN_NOT_USED")
            if tap(nodes, ["Next", "다음", "Continue", "계속", "Get started", "시작하기",
                           "Finish", "완료", "Let's go", "Start", "시작"]):
                continue
            if tap(nodes, ["Search", "Search apps", "앱 검색", "검색"]):
                adb("shell", "input", "text", "IDOLCHAMP")
                adb("shell", "input", "keyevent", "66")
                time.sleep(6)
                continue
            if tap(nodes, ["아이돌챔프", "IDOL CHAMP", "IDOLCHAMP"]):
                continue
            if tap(nodes, ["Install", "설치", "Download", "다운로드"]):
                time.sleep(12)
                continue
            if tap(nodes, ["Allow", "허용"]):
                continue
            # Cannot infer screen controls from coordinates. Stop with evidence.
            note("aurora_navigation", "UI_UNKNOWN", "No recognized non-voting control on visible screen")
            break
        report["apk_installed"] = wait_package(APP, attempts=4, delay=4)
        if report["apk_installed"]:
            report["source_method"] = "aurora_google_play"
            note("idolchamp_install", "OK")
        else:
            note("idolchamp_install", "NOT_INSTALLED", "Aurora could not complete anonymous download")
        return report["apk_installed"]
    except Exception as exc:
        report["errors"].append("AURORA_NAVIGATION:" + str(exc)[:300])
        note("aurora_navigation", "ERROR", exc)
        return False

def direct_apk_attempt():
    url = os.getenv("IDOLCHAMP_APK_URL", "").strip()
    expected = os.getenv("IDOLCHAMP_APK_SHA256", "").strip()
    if not url: return False
    apk = OUT / "idolchamp-install.apk"
    try:
        source = fetch_apk(url, apk, max_bytes=250*1024*1024, expected_sha=expected)
        if not expected: raise ValueError("SHA256_REQUIRED")
        note("direct_apk", "DOWNLOADED", source["sha256"][:24])
        install_apk(apk, APP)
        report["source_method"] = "verified_direct_apk"
        report["apk_installed"] = True
        note("idolchamp_install", "OK", "APK SHA256 verified")
        return True
    except Exception as exc:
        report["errors"].append("DIRECT_APK:" + str(exc)[:300])
        note("direct_apk", "BLOCKED", exc)
        return False
    finally:
        apk.unlink(missing_ok=True)


def apksigner_path():
    available = shutil.which("apksigner")
    if available: return available
    sdk = Path(os.getenv("ANDROID_SDK_ROOT") or os.getenv("ANDROID_HOME") or "/opt/android-sdk")
    paths = sorted((sdk/"build-tools").glob("*/apksigner"), reverse=True)
    if paths: return str(paths[0])
    raise RuntimeError("APK_SIGNER_TOOL_MISSING")

def signer_sha1(apk_path):
    # Build-tools output varies: newer apksigner sometimes prints only
    # signer SHA-256, and SourceStamp SHA-256. Never mistake SourceStamp
    # for the developer's signer. Hash the actual X.509 signer PEM instead.
    import base64
    process = subprocess.run(
        [apksigner_path(), "verify", "--print-certs-pem", str(apk_path)],
        cwd=ROOT, capture_output=True, text=True, timeout=70
    )
    if process.returncode != 0:
        raise RuntimeError("APK_SIGNATURE_INVALID: " + process.stderr[-240:])
    certificates = re.findall(
        r"-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)"
        r"-----END CERTIFICATE-----", process.stdout, re.S
    )
    if not certificates:
        # Legacy apksigner output fallback when the PEM flag is unsupported.
        digest = re.search(
            r"(?m)^Signer(?: #\d+| \([^\n]+\)) certificate SHA-1 digest:\s*"
            r"([a-fA-F0-9:]{40,60})", process.stdout
        )
        if digest:
            return digest.group(1).replace(":", "").lower()
        raise RuntimeError("APK_SIGNER_CERT_NOT_AVAILABLE: no signed certificate PEM")
    digests = []
    for cert in certificates:
        der = base64.b64decode(re.sub(r"\s+", "", cert))
        digests.append(hashlib.sha1(der).hexdigest())
    if IDOLCHAMP_SIGNER_SHA1 not in digests:
        raise RuntimeError("APK_SIGNER_MISMATCH: " + ",".join(digests)[:130])
    return IDOLCHAMP_SIGNER_SHA1

def try_xapk_mirror():
    """Try real IDOLCHAMP APK installation from an HTTPS mirror, with pinned signer.

    The mirror is not the official store; no integrity claim is made unless the
    app's embedded signing cert matches an independently recorded fingerprint.
    Nothing from an unsigned or mismatched archive is ever installed.
    """
    note("signed_mirror", "STARTED", "APKPure XAPK HTTPS (third-party, signer-checked)")
    path = OUT/"idolchamp-download.xapk"
    try:
        download = fetch_apk(MIRROR_XAPK_URL, path, max_bytes=245*1024*1024)
        note("signed_mirror_download", "OK", download["sha256"][:24])
        if not zipfile.is_zipfile(path):
            raise RuntimeError("MIRROR_NOT_A_ZIP_APK: received HTML or unrecognized content")
        with zipfile.ZipFile(path) as archive, tempfile.TemporaryDirectory() as temp:
            members = [x for x in archive.infolist()
                       if x.filename.lower().endswith(".apk") and not x.is_dir()]
            if not members:
                raise RuntimeError("NO_APK_MEMBERS")
            if sum(x.file_size for x in members) > 260*1024*1024:
                raise RuntimeError("APK_ARCHIVE_TOO_LARGE")
            if len(members) > 45:
                raise RuntimeError("TOO_MANY_APK_MEMBERS")
            destination = Path(temp)
            extracted = []
            for idx, member in enumerate(members):
                target = destination/("%02d-" % idx + Path(member.filename).name)
                if member.file_size > 230*1024*1024:
                    raise RuntimeError("APK_MEMBER_TOO_LARGE")
                with archive.open(member) as original, target.open("wb") as output:
                    shutil.copyfileobj(original, output)
                if signer_sha1(target) != IDOLCHAMP_SIGNER_SHA1:
                    raise RuntimeError("IDOLCHAMP_SIGNER_MISMATCH")
                extracted.append((Path(member.filename).name, target))
            base = next(((name, file) for name,file in extracted
                         if name in ("com.nwz.ichampclient.apk", "base.apk")), None)
            if base is None:
                raise RuntimeError("BASE_APK_MISSING")
            aapt = shutil.which("aapt")
            if aapt:
                info = run(aapt, "dump", "badging", str(base[1]), timeout=35)
                if not re.search(r"package: name='com\.nwz\.ichampclient'", info):
                    raise RuntimeError("APK_PACKAGE_NAME_MISMATCH")
            abis = adb("shell", "getprop", "ro.product.cpu.abilist").strip()
            note("emulator_abi", "OBSERVED", abis)
            # Prefer locale/density splits, then a matching native split. Some
            # x86_64 Google images implement arm translation; install is the test.
            split = [(name,file) for name,file in extracted if (name,file)!=base]
            locale = [(name,file) for name,file in split
                      if re.search(r"(?:config\.|split_config\.)(en|ko|mdpi|hdpi|xhdpi|xxhdpi)(?:\.|$)",name,re.I)]
            native = [(name,file) for name,file in split
                      if any(x in name for x in ("arm64_v8a","armeabi_v7a","x86_64","x86"))]
            selected = [base[1]] + [file for _,file in locale] + [file for _,file in native]
            selected = list(dict.fromkeys(selected))
            note("signed_mirror_install", "STARTED",
                 "signed packages=" + str(len(selected)) +
                 " splits=" + ",".join(name for name,_ in extracted)[:140])
            outcome = adb("install-multiple", "-r", *[str(file) for file in selected],
                          timeout=250)
            if "Success" not in outcome or not installed(APP):
                raise RuntimeError("INSTALL_MULTIPLE_FAILED: " + outcome[-450:])
            report["source_method"] = "signed_unofficial_apk_mirror"
            report["apk_installed"] = True
            note("signed_mirror_install", "OK", "signer SHA1 matched")
            return True
    except Exception as exc:
        report["errors"].append("SIGNED_MIRROR:" + str(exc)[:350])
        note("signed_mirror", "BLOCKED", str(exc))
        return False
    finally:
        path.unlink(missing_ok=True)

def extract_one():
    # Standalone call. Do NOT call android_collect.run(), which writes the shared JSON.
    import android_collect
    app = next(a for a in json.loads((ROOT/"config/apps.json").read_text())
               if a["id"] == "idolchamp")
    adb("shell", "monkey", "-p", APP, "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(8)
    nodes = screen("03-idolchamp-launch")
    # A real foreground focus check avoids treating monkey event injection as launch success.
    focused = adb("shell", "dumpsys", "window", "windows")
    resumed = adb("shell", "dumpsys", "activity", "activities")
    report["app_launched"] = APP in focused or APP in resumed
    note("idolchamp_launch", "OK" if report["app_launched"] else "NOT_VERIFIED",
         "foreground activity verified" if report["app_launched"] else "target not in focused/resumed activity")
    if not report["app_launched"]: return
    observations = []
    parsed_events = []
    try:
        parsed_events = android_collect.collect(
            app, max_pages=3, max_details=1,
            detail_callback=observations.append
        )
        report["vote_list_opened"] = True
        report["vote_extracted"] = bool(parsed_events)
        report["extracted_count"] = len(parsed_events)
        note("vote_one_detail", "EXTRACTED",
             str(len(parsed_events)) + " screen events; original comparison pending")
    except Exception as exc:
        # May be login gate, app version mismatch, invalid title/dates or layout.
        report["errors"].append("APP_UI:" + str(exc)[:300])
        note("vote_one_detail", "BLOCKED", exc)
    finally:
        # Keep all observed evidence, even if the conservative parser rejects it.
        # Do not write the shared dist/data/events.json from Android probes.
        from android_evidence import enrich_android_observation
        enriched = [enrich_android_observation(
            record, screenshot_file="verification/android/idolchamp/04-idolchamp-after-collection.png"
        ) for record in observations]
        out = {
            "app": "idolchamp", "source": "android_screen",
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "lineup_complete": False, "source_compared": False,
            "events": parsed_events, "structured_events": enriched
        }
        (OUT/"events.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if observations:
            (OUT/"raw_observations.json").write_text(
                json.dumps(observations, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        try: screen("04-idolchamp-after-collection")
        except Exception: pass

def main():
    try:
        report["booted"] = adb("shell", "getprop", "sys.boot_completed").strip() == "1"
        note("emulator_boot", "OK" if report["booted"] else "FAILED")
        if not report["booted"]: return
        if not direct_apk_attempt():
            if not playstore_attempt():
                if not aurora_attempt():
                    try_xapk_mirror()
        if report["apk_installed"] or installed(APP):
            report["apk_installed"] = True
            extract_one()
        else:
            note("data_collection", "BLOCKED", "IDOLCHAMP APK not installed; no data asserted")
    except Exception as exc:
        report["errors"].append("UNEXPECTED:" + str(exc)[:300])
        note("unexpected", "ERROR", exc)
    finally:
        if not (OUT/"events.json").exists():
            (OUT/"events.json").write_text(json.dumps({
                "app": "idolchamp", "source": "android_screen",
                "events": [], "source_compared": False, "lineup_complete": False,
                "note": "Actual app UI not available; zero verified records."
            },ensure_ascii=False,indent=2),encoding="utf-8")
        (OUT/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
        print("RESULT_JSON", json.dumps({
            k: report[k] for k in ("booted", "aurora_installed", "apk_installed",
                  "app_launched", "vote_list_opened", "vote_extracted", "extracted_count",
                  "source_compared", "full_list_collected", "source_method")
        },ensure_ascii=False),flush=True)
        if os.getenv("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"],"a",encoding="utf-8") as f:
                f.write("### IDOLCHAMP Android install / capture\n\n```json\n" +
                        json.dumps(report,ensure_ascii=False,indent=2)[:10000] +
                        "\n```\n\nData is staged only in artifact; not merged to shared JSON.\n")
    # A green workflow must never be mistaken for actual target installation.
    # The artifact is uploaded even when installation or extraction is blocked.
    if not report["apk_installed"]:
        raise SystemExit("IDOLCHAMP_INSTALL_NOT_VERIFIED")
    if not report["vote_extracted"]:
        raise SystemExit("IDOLCHAMP_VOTE_NOT_EXTRACTED")

if __name__ == "__main__":
    main()
