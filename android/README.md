# Vote Atlas Android collector – Galaxy S10e

## What this build actually does
- When enabled, the app schedules a **best-effort** collection each day at **09:30 Asia/Seoul**.
- An Android accessibility service bound to `com.nwz.ichampclient` attempts to launch IdolChamp, select the explicitly labelled vote tab, scroll public voting listings, enter explicitly dated poll cards, and parse visible candidate/reward text. It will **never** automatically press vote, advertising, login or purchase buttons.
- Verified structured observations are queued locally and submitted to the `incoming/idolchamp/` folder of the public vote-atlas repository. The ingestion workflow updates dashboard data.
- Fails closed when a locked/off screen, missing Wi-Fi, missing accessibility service, missing IdolChamp installation or unrecognized UI blocks access. Retries are capped.

## First-time setup (phone only)
1. Download the generated APK from [Build Vote Atlas Android collector](https://github.com/ark-netizen/vote-atlas/actions/workflows/build-android-collector.yml) / latest successful run / artifact. Install it on S10e. The user must approve the installation; remote installation is not possible from ChatGPT.
2. Install or update the official **아이돌챔프** app; complete login if the official app requires it. Our collector never submits credentials.
3. Settings → 접근성 → 설치된 앱 → **아이돌챔프 화면 읽기** → 사용. Allow accessibility for this collector after reviewing its purpose.
4. Create a **fine-grained** GitHub token at GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, select ONLY `ark-netizen/vote-atlas` with Contents permission **Read and write**. Paste it into the collector, then tap **① 토큰 저장**. NEVER send tokens in chat or commit them to the repository.
5. Tap **③ 매일 자동 수집 켜기**, then **바로 자동 탐색 테스트** and check result / dashboard.
6. For best results, plug in the phone, leave Wi-Fi on, keep the screen on and unlocked, turn off battery optimization for the collector, and do not activate power saving. Samsung: Settings → 디스플레이 → 화면 자동 꺼짐 시간; 개발자 옵션 → 충전 중 화면 켜짐 (if available); Settings → 애플리케이션 → Vote Atlas 수집기 → 배터리 → 제한 없음 (names vary with One UI version).

## Important limits
- Simply disabling the background/battery lock does **not** unlock Android's screen or bypass background activity launch restrictions. The collector cannot silently install itself or guarantee that it can open IdolChamp while locked. You must **install once manually** and allow Android accessibility access. Screen-on + unlocked is the intended deployment mode.
- The navigator is unverified on an actual Galaxy S10e/IdolChamp UI. System may deny background activity starts. Unknown card layouts, dynamic content rendered as images/WebViews and dates without a year are intentionally not guessed. Thus **full daily vote coverage is not guaranteed**.
- Unrecognized/unsafe screens are skipped. No password fields, personal data, payment activity or screenshots are deliberately transmitted. The public repository is not private.
- Token is encrypted in Android Keystore AES-GCM. It has write access to the selected repository. Delete it from this app and revoke it in GitHub if lost.
- GitHub Actions compile + unit tests verify source correctness but are **not proof of full end-to-end performance on the real phone**.
