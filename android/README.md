# Vote Atlas Android Collector (아이돌챔프 / Galaxy S10e)

이 앱은 갤럭시 S10e 등 실제 Android 휴대전화에서 아이돌챔프의 공개 투표 화면을 관찰한 뒤, 명시적인 연도와 투표 기간이 확인된 **구조화된 투표 레코드**만 GitHub로 전송하는 첫 버전입니다.

**주의: 실제 아이돌챔프 화면으로 실행 검증되지 않았습니다.** 설치·권한·GitHub 전송은 빌드 후 테스트해야 하며, 아이돌챔프의 모든 투표/후보/리워드를 자동 탐색·수집한다고 주장할 수 없습니다. 이미지로만 표시되는 텍스트는 접근성 트리에서 읽히지 않을 수 있어 OCR 지원을 별도로 추가해야 합니다. 접근성 서비스는 로그인이나 결제를 하지 않고 어떤 버튼도 자동으로 누르지 않습니다. 앱을 전경에 띄우고 화면을 켠 상태에서 직접 투표 탭과 상세 화면을 탐색해야 합니다. 화면을 끄거나 아이돌챔프가 차단하면 수집은 되지 않습니다.

## 설치

1. GitHub Actions의 **Build Vote Atlas Android collector** 워크플로에 들어가 최신 성공 실행의 artifact `vote-atlas-collector-debug-apk`를 다운로드합니다. zip 압축을 푼 `app-debug.apk`를 휴대전화로 옮겨 설치합니다. 디버그 서명 앱이므로 정식 앱스토어 배포용이 아닙니다.
2. Android 설정 → 접근성 → 설치된 앱 → **아이돌챔프 화면 읽기** 서비스를 켭니다. 서비스는 `com.nwz.ichampclient` 패키지만 관찰합니다.
3. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens에서 `ark-netizen/vote-atlas` 저장소 전용 토큰을 만듭니다. Repository permissions의 **Contents: Read and write**만 부여합니다. 토큰은 공유하거나 저장소/이슈/채팅에 붙여넣지 마세요. 휴대전화 앱 입력란에만 저장합니다(Android Keystore AES-GCM).
4. 앱에서 **수집 시작 + 아이돌챔프 열기**를 누른 뒤, 투표 탭 및 각 투표 상세 화면을 직접 탐색합니다. 수집된 레코드는 대기열에 보관되고 10분 간격으로 자동 전송을 시도합니다. **지금 GitHub에 올리기** 버튼으로 즉시 보낼 수도 있습니다.
5. 전송에 성공하면 `incoming/idolchamp/YYYY-MM-DD/<timestamp>.json` 파일이 생성됩니다. `Ingest IdolChamp device observations` 워크플로가 스키마 검증을 거쳐 `dist/data/events.json`에 반영합니다.

## 보안 / 한계

- 오직 아이돌챔프 앱 화면에서 날짜·투표명·명시적 후보 순위·득표·리워드 문구를 읽습니다. 프로필·비밀번호 입력 필드는 수집하지 않습니다. 전체 스크린샷과 모든 화면 텍스트는 GitHub에 업로드하지 않습니다.
- 공개 GitHub 저장소입니다. 개인정보나 내부 전용 정보가 포함된 화면에서는 수집을 중지하세요. 접근성 읽기 권한은 사용자가 직접 해제할 수 있습니다.
- 사용자의 토큰으로 GitHub 저장소 콘텐츠에 쓰기 권한이 부여됩니다. 권한 범위를 해당 저장소로 제한하고 필요 없으면 폐기하세요.
- 실제 화면에서 날짜가 연도 없이 표시되거나 후보/기간이 이미지라면 누락됩니다. 임의로 추정해 기록하지 않습니다.
- 신규 APK를 설치하는 단계는 휴대전화에서 직접 수행해야 합니다. 앱을 설치한다고 자동으로 전체 투표 탐색이 보장되지는 않습니다.
