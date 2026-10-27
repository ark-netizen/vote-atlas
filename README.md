# Vote Atlas

마이원픽·뮤니버스·아이돌챔프·뮤빗·쿠궁·팬앤스타 투표 캘린더 프로젝트입니다.

## 현재 검증 상태

- GitHub Actions Android 에뮬레이터 검증 작업을 연결했습니다.
- 앱 설치 및 실제 투표 화면 수집은 아직 검증되지 않았습니다.
- 공개 APK 다운로드 시 HTTP 403 (error code 1010)으로 차단되어 설치 파일을 확보하지 못했습니다. 차단 우회는 구현하지 않습니다.
- `dist/`는 캘린더 화면이며 실제 수집 데이터는 아직 없습니다.
- 파서 단위 테스트 10개 통과는 실제 앱 수집 성공을 의미하지 않습니다.

## 구성

- `.github/workflows/verify.yml`: Android 부팅, 화면·UI XML·설치 상태 증거 저장
- `scripts/android_collect.py`: ADB UI XML 및 Tesseract OCR 수집 초안 (앱별 미검증)
- `scripts/core.py`: 날짜·순위 파싱 및 중복 병합
- `config/apps.json`: 대상 앱 패키지와 탐색 설정
- `dist/`: 정적 캘린더

검증 실행 결과와 `android-verification` 첨부 파일은 저장소 Actions에서 확인할 수 있습니다.
정기 수집과 Pages 자동 배포는 실제 앱 수집 검증 이후 연결해야 합니다.

## 로컬 확인

```bash
python3 -m unittest discover -s tests -v
python3 -m http.server 8000 --directory dist
```

수집기는 ADB로 접근 가능한 Android에 앱이 설치되어 있어야 합니다.
앱이 없거나 읽기 실패한 경우 빈 데이터를 성공으로 표시하면 안 됩니다.
전체 후보 명단과 최종 우승자는 명시적으로 확인된 경우에만 확정합니다.
