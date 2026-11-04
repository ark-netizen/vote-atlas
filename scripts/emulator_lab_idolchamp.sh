#!/usr/bin/env bash
set -uo pipefail
mkdir -p "$RUNNER_TEMP/idolchamp-lab"
cd "$RUNNER_TEMP/idolchamp-lab"
{
  echo '### IdolChamp emulator execution test'
  echo 'Isolated test environment: no account sign-in, votes or payments.'
  echo '#### Device'
  adb shell getprop ro.build.fingerprint | sed 's/^/Build fingerprint: /'
  adb shell getprop ro.product.model | sed 's/^/Model: /'
  adb shell getprop ro.product.cpu.abilist | sed 's/^/Supported ABIs: /'
  adb shell getprop ro.dalvik.vm.native.bridge | sed 's/^/Native bridge: /'
  echo '#### Installation'
  mapfile -t apks < <(find "$RUNNER_TEMP/idolchamp-splits" -maxdepth 1 -type f -name '*.apk' | sort)
  echo "APK splits: ${#apks[@]}"
  install_result='not_attempted'
  if [ "${#apks[@]}" -gt 0 ]; then
    adb install-multiple -r "${apks[@]}" > install.log 2>&1
    status=$?
    cat install.log
    if [ "$status" -eq 0 ]; then install_result='success'; else install_result="failure_$status"; fi
  fi
  echo "Install result: $install_result"
  if [ "$install_result" = 'success' ]; then
    echo '#### App launch'
    adb shell monkey -p com.nwz.ichampclient -c android.intent.category.LAUNCHER 1
    sleep 25
    adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity|com.nwz.ichampclient' | head -25 || true
    adb shell pidof com.nwz.ichampclient || true
    adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
    adb pull /sdcard/window.xml window.xml >/dev/null 2>&1 || true
    adb exec-out screencap -p > emulator-screen.png || true
    echo 'Captured emulator screenshot.'
  else
    echo 'Cannot evaluate app emulator detection: install did not succeed.'
  fi
  adb logcat -d -t 1200 -v brief > emulator-logcat.txt || true
  echo "Experiment state: $install_result"
  echo 'No actual IdolChamp vote counts verified by this test.'
} 2>&1 | tee result.txt
cat result.txt >> "$GITHUB_STEP_SUMMARY"
