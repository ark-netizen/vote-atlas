# Vote Atlas · IdolChamp button-started collector v0.6

This is a **prototype** Android collector, not a Play Store-reviewed app. The user starts it explicitly from the app. It can navigate only the public IdolChamp Android UI and tries to capture candidate rankings, actual vote totals, voting periods and reward text. It cannot guarantee complete coverage of votes.

## Install and run
1. On Galaxy S10e, open https://ark-netizen.github.io/vote-atlas/install.html and download APK.
2. Install the official IdolChamp app from Google Play and complete any required login in that official app.
3. If the Play Protect security service blocks installation, **do not assume that disabling security is safe**. The binary has only been checked by static source review, build verification and Android unit tests; there has been no independent malware audit or real-device end-to-end QA.
4. Enable the Vote Atlas accessibility service consciously: Settings → Accessibility → Installed services → 아이돌챔프 자동 수집.
5. If uploading results, configure an **individual fine-grained GitHub PAT** restricted to `ark-netizen/vote-atlas` and Contents Read/Write. Never send this token in chat.
6. On Wi-Fi, open Vote Atlas, tap **자동 수집 시작 · 아이돌챔프 열기** and keep the phone unlocked. It will attempt to navigate public vote cards and scroll candidate screens. Return to Vote Atlas for status or to press stop.
7. After testing, turn off the accessibility service again. Revoke the PAT from GitHub if no longer needed.

## Security scope
- User-started only. No background automatic launch, boot-triggered crawl, idle screen reading, or system-wide monitoring.
- Accessibility events and content are restricted to Android package `com.nwz.ichampclient`. Screenshots are processed in RAM with Google's ML Kit OCR, never retained or uploaded. Only parsed, structured public vote fields can be sent.
- The Android manifest asks for INTERNET and ACCESS_NETWORK_STATE. The accessibility service itself is gated by BIND_ACCESSIBILITY_SERVICE and explicitly user enabled. The merged APK also contains an app-local auto-generated receiver permission.
- The only explicit collector network destination is GitHub REST API over HTTPS in `UploadClient`, set to `https://api.github.com/repos/ark-netizen/vote-atlas/contents/`. Redirect following is disabled.
- User's GitHub token is encrypted with Android Keystore AES-GCM. Public vote observations go into a **public** GitHub repository, so don't use this app on private screens.
- The collector is programmed not to click login, vote, checkout, purchase, recharge, or advertising controls. The live UI of IdolChamp has not been independently verified and updates can break the crawler.
- This document and source audit cannot establish that the executable contains no malicious code, nor overrule Google Play Protect warnings. Built-in and third-party dependencies can contain risks not identified by the limited review.

## Tested
GitHub Actions builds, Android unit tests, zip integrity, APK signature verification, and an audited allowlist of merged APK permissions. The actual Galaxy S10e, live IdolChamp voting UI, and Play Protect classification remain untested. Unknown text formats and missing dates are skipped rather than fabricated.
