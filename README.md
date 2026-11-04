# Vote Atlas

[기존 캘린더 열기](https://vote-atlas-calendar.peppysky16.chatgpt.site) · [통합 대시보드 소스](dist/overview.html) · [자동 수집 실행 내역](https://github.com/ark-netizen/vote-atlas/actions/workflows/collect-public.yml) · [어워즈·시상식](dist/awards.html)

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

## 어워즈·시상식 투표처 (신규)

- [어워즈 전용 화면](https://ark-netizen.github.io/vote-atlas/awards.html) · [원본 데이터](dist/data/awards.json) · [매일 검색 Actions](.github/workflows/discover-awards.yml)
- 2026년 국내 K-POP·드라마·영화·방송·예능·브랜드/소비자 참여 행사 38개를 조사 목록으로 등록했습니다. 투표처를 근거와 함께 확인한 21개와 추가 검증이 필요한 17개를 구분합니다.
- 각 행사에 플랫폼을 **복수 등록**할 수 있으며, 운영 단계(예선·결선), 부문, 공동/단독 여부, 연도, 확인 출처를 기록합니다. 브랜드 소비자 조사는 팬덤 앱과 구분합니다.
- **하루 1회 한국시간 09:40**, GitHub Actions가 Google News 공개 RSS 6개 검색식을 검사하고 `dist/data/awards.json`의 `discovered`(새 행사 후보) 및 `latest_news`(기존 시상식 관련 새 기사)를 갱신합니다.
- **오보 방지**: 기사 제목만 보고 행사 실재 여부나 투표처 계약을 확정하지 않습니다. 신규 발견은 '검토 필요'에만 등록되며 `awards[].platforms`는 자동으로 바뀌지 않습니다. 플랫폼 확정은 공식 주최/앱 공지 또는 신뢰 가능한 보도를 확인해 직접 반영합니다.
- **비용**: 별도 유료 API/서버 없이 공개 GitHub Actions 예약 작업으로 동작합니다. 다만 공개 뉴스 RSS 제공자의 응답·차단 및 GitHub Actions 예약 실행 상태에 좌우되며, 실패 시 기존 데이터를 유지하고 작업을 실패 처리합니다.
- **실행**: Actions → Discover awards and voting platforms → Run workflow. 또는 `python scripts/discover_awards.py` 로 수집하고 `python -m unittest discover -s tests -p 'test_awards.py' -v` 로 분류기를 점검하세요.
- 검색은 모든 인터넷 정보에 대한 완전한 보장이 아니며, 미발표·비공개 행사나 뉴스에 색인되지 않은 플랫폼은 자동 탐지하지 못합니다.

### 어워즈 일정 달력

- [어워즈 달력](https://ark-netizen.github.io/vote-atlas/awards.html#awardCalendar)은 월별 시상식 개최일(여러 날 열리는 경우 기간 전체 표시), 근거가 확인된 팬 투표 시작~마감 기간, 종료일이 미확인인 투표 시작일을 각각 구분합니다.
- 날짜를 누르면 해당 행사명·투표처·투표 단계·출처 원문이 표시되고, 월간 일정 목록에서 특정 일정을 선택할 수 있습니다. 개최/투표 유형 필터와 이전 달/다음 달 이동도 가능합니다.
- 근거가 없는 행사 날짜는 자동 추정하지 않습니다. 새로운 공식 일정이 검증되면 `dist/data/awards.json`의 `event_date`, `event_end_date`, `voting_periods`, `voting_milestones`를 갱신하면 달력에 자동 반영됩니다. 일일 RSS 신규 기사 후보는 검토 전에는 표시하지 않습니다.
- 테스트: `node --test tests/test_awards_calendar.cjs` 및 `node --check dist/awards.js`
