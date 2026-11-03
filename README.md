# Vote Atlas

[기존 캘린더 열기](https://vote-atlas-calendar.peppysky16.chatgpt.site) · [통합 대시보드 소스](dist/overview.html) · [자동 수집 실행 내역](https://github.com/ark-netizen/vote-atlas/actions/workflows/collect-public.yml)

공식 공개 투표 데이터를 읽고 캘린더에 표시합니다. 휴대폰, 항상 켜 둔 PC, 유료 API가 필요하지 않습니다. 기존 캘린더 링크는 현재 소유자 전용입니다. 새로운 GitHub Pages 링크는 공개 배포용입니다.

| 서비스 | 수집 범위 |
|---|---|
| 뮤니버스 | 최근 90일 공식 투표 목록·기간·전체 후보·득표·1위. 종료 및 결과 공개 시각 확인 후 최종 1위 표시 |
| 팬앤스타 | 홈에서 연결되는 현재 투표 부문·기간·페이지에 표시된 후보·득표·현재 1위. 전체 후보와 과거 최종 결과는 미확인 |
| 마이원픽·아이돌챔프·뮤빗·쿠궁 | 미연결. 실제 앱 설치 및 수집 검증 전 |

## 통합 대시보드 (새 화면)

`dist/overview.html`은 투표 일정, 후보·순위, 리워드, 수집 시각·근거 출처를 통합해 보여줍니다.
앱/진행 상태/리워드 확인 여부/후보 검색과 CSV 내보내기를 지원합니다.
`dist/data/events.json`이 업데이트되면 배포된 웹페이지에서도 데이터가 갱신됩니다.

**배포 주의:** GitHub Pages는 공개 웹사이트입니다. 내부 전용 정보를 절대 기록하지 마세요.
현재 저장소는 공개 투표 정보만 사용하며, 사내 Google 계정 전용 접근 제어는 아직 구현하지 않았습니다.

### GitHub Pages 최초 설정 (저장소 관리자 1회)

1. [Settings → Pages](https://github.com/ark-netizen/vote-atlas/settings/pages)에 들어가 Build and deployment의 Source를 **GitHub Actions**로 선택합니다.
2. [Publish Vote Atlas dashboard](https://github.com/ark-netizen/vote-atlas/actions/workflows/deploy-pages.yml)에서 **Run workflow**를 실행합니다.
3. 배포 성공 후 `https://ark-netizen.github.io/vote-atlas/overview.html`을 엽니다. URL은 배포 성공 전에는 사용 가능한 것으로 간주하지 마세요.

배포가 완료된 뒤에는 데이터 변경을 포함한 `dist/**` 변경사항이 자동으로 게시됩니다.
GitHub Actions 예약 수집과 GitHub Pages 배포는 별도 워크플로입니다.

### 리워드 추출 범위

- 뮤니버스: 개별 투표 공식 상세 설명의 혜택·광고·트로피 등 명시된 문구를 추출합니다. 문구가 없으면 리워드 미확인으로 남깁니다.
- 팬앤스타: 현재 표시된 후보와 기간은 부분 수집하지만 리워드 추출은 미확인입니다.
- 마이원픽·아이돌챔프·뮤빗·쿠궁: 앱 내부 수집은 아직 미검증입니다. 다른 앱의 공통 광고 혜택을 개별 투표 리워드로 채우지 않습니다.

## 자동 실행

GitHub Actions가 매일 **한국시간 09:23 / 21:23**에 수집합니다. GitHub 사정에 따라 실행이 지연될 수 있습니다. 공개 저장소의 장기 비활동으로 예약 실행이 중지되면 Actions에서 다시 활성화해야 합니다.

수집 결과는 `dist/data/events.json`에 저장됩니다. 캘린더는 이 저장소의 최신 JSON을 읽습니다. 수집 오류가 나면 이전 기록을 유지하고 연결 상태에 실패를 표시합니다. 과거에 수집한 기록은 90일이 지나도 삭제하지 않습니다.

직접 새로 수집하려면 Actions → Collect official voting data → Run workflow를 실행하세요. 캘린더의 새로고침은 이미 저장된 데이터를 다시 읽습니다.

## 검증 및 한계

- Android 11 에뮬레이터 부팅·화면 캡처·UI XML 추출: [실제 성공 기록](https://github.com/ark-netizen/vote-atlas/actions/runs/40432798143)
- 앱 APK 다운로드 경로는 HTTP 403으로 막혀 앱 자체는 미검증입니다.
- 공식 웹사이트의 공개 응답을 사용하며 로그인·투표·결제는 하지 않습니다.
- 팬앤스타 연도는 수집일과 표시된 월일을 기준으로 추정합니다. 마감 시각은 미확인입니다.
- 현재 1위는 수집 시점의 값이며 실시간 중계가 아닙니다. 동률이면 여러 후보를 표시합니다.
- 공식 페이지 변경 시 수집기 수정이 필요할 수 있습니다.

## 개발

```bash
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests -v
python3 scripts/web_collect.py
python3 -m http.server 8000 --directory dist
```

`web_collect.py`는 실제 연결된 공식 웹 수집기입니다. `android_collect.py`는 앱별 검증 전인 Android UI/OCR 초안입니다. 두 경로의 검증 상태는 별개입니다.
