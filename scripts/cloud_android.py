"""Isolated, credential-free Android collection probe; never writes shared data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
import zipfile

import android_collect
from core import now
from reward_parse import extract_entries

ROOT = Path(__file__).resolve().parents[1]


def run(*args, timeout=90):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError((p.stderr or p.stdout)[-900:])
    return p.stdout


def download(url, target):
    req = urllib.request.Request(url, headers={'User-Agent': 'VoteAtlas-Android-Probe/1.0'})
    with urllib.request.urlopen(req, timeout=60) as response, target.open('wb') as f:
        if not response.url.startswith('https://'):
            raise ValueError('Non-HTTPS redirect')
        count = 0
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > 300 * 1024 * 1024:
                raise ValueError('Download exceeds limit')
            f.write(chunk)
    return hashlib.sha256(target.read_bytes()).hexdigest()


def acquire(app, report):
    sdk = Path(os.environ.get('ANDROID_HOME', '/usr/local/lib/android/sdk'))
    signer = sorted((sdk / 'build-tools').glob('*/apksigner'))[-1]
    aapt = signer.parent / 'aapt'
    package = app['package']
    url = 'https://d.apkpure.net/b/XAPK/' + package + '?version=latest'
    report['apk_source'] = url
    report['publisher_identity_verified'] = False
    report['apk_source_note'] = 'Third-party mirror; valid APK signatures do not independently prove publisher identity.'
    with tempfile.TemporaryDirectory() as td:
        folder = Path(td)
        archive = folder / 'download.zip'
        report['download_attempts'] = []
        for candidate in [url, url.replace('/XAPK/', '/APK/')]:
            try:
                report['download_sha256'] = download(candidate, archive)
                report['apk_source'] = candidate
                break
            except Exception as exc:
                report['download_attempts'].append({'url': candidate, 'error': str(exc)[:200]})
        else:
            raise RuntimeError('APK_DOWNLOAD_BLOCKED: ' + json.dumps(report['download_attempts']))
        with zipfile.ZipFile(archive) as z:
            members = [m for m in z.infolist() if m.filename.endswith('.apk')]
            if not members:
                members = []
                files = [archive]
            else:
                if len(members) > 45 or sum(m.file_size for m in members) > 400 * 1024 * 1024:
                    raise ValueError('Archive exceeds limits')
                files = []
                for i, member in enumerate(members):
                    path = folder / (str(i) + '.apk')
                    with z.open(member) as src, path.open('wb') as dst:
                        shutil.copyfileobj(src, dst)
                    files.append(path)
        supported = run('adb', 'shell', 'getprop', 'ro.product.cpu.abilist').strip().split(',')
        parts = []
        certs = set()
        for file in files:
            cert = run(str(signer), 'verify', '--print-certs', str(file))
            digests = re.findall(r'^Signer #\d+ certificate SHA-256 digest: (\w+)', cert, re.M)
            if not digests:
                raise ValueError('Signing certificate not found')
            certs.add(tuple(sorted(digests)))
            meta = run(str(aapt), 'dump', 'badging', str(file))
            if not re.search(r"package: name='" + re.escape(package) + "'", meta):
                raise ValueError('APK package mismatch')
            abi = re.search(r"native-code: (.*)", meta)
            abis = re.findall(r"'([^']+)'", abi[1]) if abi else []
            split = re.search(r"split='([^']+)'", meta)
            parts.append((file, abis, split[1] if split else None))
        if len(certs) != 1:
            raise ValueError('Split signing certificate mismatch')
        report['signer_sha256'] = list(next(iter(certs)))
        chosen_abi = next((a for a in supported if any(a in abis for _, abis, _ in parts)), None)
        selected = [str(f) for f, abis, split in parts if not abis or chosen_abi in abis]
        if not any(split is None for _, _, split in parts):
            raise ValueError('Base APK missing')
        result = run('adb', 'install-multiple', '-r', *selected, timeout=240)
        if 'Success' not in result:
            raise ValueError(result[-500:])
        report['apk_installed'] = True


def snapshot(out, label):
    xml = android_collect.capture()
    (out / (label + '.xml')).write_text(xml)
    (out / (label + '.png')).write_bytes(android_collect.adb('exec-out', 'screencap', '-p', binary=True))
    text = '\n'.join(n['text'] for n in android_collect.screen_nodes(xml))
    print('SCREEN', label, text[:3500], flush=True)
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', required=True, choices=['my1pick', 'mubeat', 'coogoong'])
    args = parser.parse_args()
    app = next(a for a in json.loads((ROOT / 'config/apps.json').read_text()) if a['id'] == args.app)
    out = ROOT / 'verification/cloud-android' / args.app
    out.mkdir(parents=True, exist_ok=True)
    report = dict(app=args.app, checked_at=now(), apk_installed=False, app_launched=False,
                  extracted_count=0, source_compared=False, full_list_collected=False)
    events = []
    try:
        acquire(app, report)
        android_collect.launch(app)
        report['app_launched'] = app['package'] in run('adb', 'shell', 'dumpsys', 'activity', 'activities')
        visible = snapshot(out, 'launch')
        if re.search(r"can't use an emulator|emulator.*not supported|에뮬레이터.*불가", visible, re.I):
            raise RuntimeError('EMULATOR_BLOCKED')
        events = android_collect.collect(app, max_pages=6, max_details=20)
        for event in events:
            event['reward_entries'] = extract_entries(event.get('reward', '').splitlines(), app['url'], now(), source_kind='android_screen')
        report['extracted_count'] = len(events)
        report['status'] = 'SOURCE_COMPARISON_REQUIRED'
        snapshot(out, 'after')
    except Exception as exc:
        report['status'] = 'BLOCKED'
        report['error'] = str(exc)[:1500]
        if report['apk_installed']:
            try:
                snapshot(out, 'blocked')
            except Exception as snapshot_error:
                report['snapshot_error'] = str(snapshot_error)[:200]
    finally:
        (out / 'events.json').write_text(json.dumps({'events': events, 'source_compared': False}, ensure_ascii=False, indent=2))
        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print('RESULT_JSON', json.dumps(report, ensure_ascii=False), flush=True)
    if not events:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
