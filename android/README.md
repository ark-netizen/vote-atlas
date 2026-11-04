# Vote Atlas IdolChamp screen capture collector – Android v0.4

This is the **non-accessibility** version, designed to reduce the Google Play Protect installation warning associated with sensitive permissions on internet-sideloaded apps. It does **not** circumvent Play Protect. The previous fully automatic navigator has been removed from the shipped APK.

## What works
- The user opens IdolChamp and takes a screenshot of a PUBLIC vote listing or detail.
- In Vote Atlas, tap **스크린샷 선택 · 한글 자동 인식**, select an image from Android's file picker (no photo-library permission). Alternatively share a screenshot from Gallery to **Vote Atlas 캡처 수집기**.
- Offline bundled ML Kit Korean OCR recognizes text on-device. The user can review and correct the title, voting dates and recognized text.
- When a recognized voting period has an explicit year, the user confirms a short structured preview. Only parsed public vote fields are added to a local upload queue.
- The queue uploads with GitHub API over HTTPS using a fine-grained **Contents Read and write** token limited to `ark-netizen/vote-atlas`. Token is encrypted with Android Keystore, never stored in source code.
- The app can schedule daily Wi-Fi retries of **already imported** data. It does **not** automatically launch IdolChamp or discover new polls.

## Does not work
- Unattended daily collection of all IdolChamp votes: requires accessibility to automate a third-party app, which triggers Play Protect sideload blocking in some markets. No accessibility service is registered and no accessibility permission is requested.
- OCR is not guaranteed correct. Missing dates, ranks, candidates or reward information are not inferred. Screenshots are not uploaded.
- Installing on a real Galaxy S10e, Play Protect's verdict and IdolChamp screenshot readability must be verified on-device; GitHub unit tests/compilation are not proof of those results.

## Setup
1. Download APK from `https://ark-netizen.github.io/vote-atlas/install.html`; install using standard Android installation prompts. **Do not disable Play Protect.** If still blocked, stop and share the exact warning.
2. Create a fine-grained GitHub personal access token with only `ark-netizen/vote-atlas` and repository Contents Read and write; put it in the app. Never paste tokens in chat.
3. Open the official IdolChamp app, take a screenshot of a publicly visible vote detail showing the vote name and start/end dates.
4. Switch to Vote Atlas, choose screenshot, review/edit recognized content, and confirm the item for GitHub upload.
5. Optional: turn on 09:30 daily retry of any queued uploads. Wi-Fi is required.

## Security
The APK manifest requests only INTERNET, ACCESS_NETWORK_STATE and RECEIVE_BOOT_COMPLETED. There is no accessibility service, screenshot capture permission, SMS permission or notification listener. Screenshot selection requires an explicit action. Only validated structured data is publicly published; never choose a screenshot containing personal information. Upload is to a **public repository**.
