"""Verify infrastructure only; absent applications are never reported as tested."""
import json
import os
import pathlib
import subprocess

out = pathlib.Path('verification')
out.mkdir(exist_ok=True)
def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=60).decode().strip()

booted = adb('shell', 'getprop', 'sys.boot_completed') == '1'
packages = set(adb('shell', 'pm', 'list', 'packages').splitlines())
report = {
    'emulator_booted': booted,
    'android_version': adb('shell', 'getprop', 'ro.build.version.release'),
    'abis': adb('shell', 'getprop', 'ro.product.cpu.abilist'),
    'apps': [{'id': app['id'], 'package': app['package'],
              'installed': 'package:' + app['package'] in packages,
              'collection_verified': False,
              'status': 'APK_REQUIRED'}
             for app in json.loads(pathlib.Path('config/apps.json').read_text())]
}
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
with (out / 'screen.png').open('wb') as stream:
    subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=stream, check=True, timeout=30)
adb('shell', 'uiautomator', 'dump', '/sdcard/window.xml')
subprocess.run(['adb', 'pull', '/sdcard/window.xml', str(out / 'window.xml')], check=True)
summary = '## Infrastructure verification\n\nEmulator booted: ' + str(booted) + '\n\nApp collection: NOT VERIFIED. App APKs are not installed.\n'
print(json.dumps(report, ensure_ascii=False, indent=2))
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
        f.write(summary)
assert booted, 'Android did not finish booting'
