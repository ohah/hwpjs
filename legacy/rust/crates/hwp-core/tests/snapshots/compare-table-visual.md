# table.html 시각 비교 (브라우저 캡처)

**캡처일**: 2026-02-21  
**도구**: agent-browser (실제 브라우저 전체 페이지 스크린샷)

## 파일

| 구분 | URL | 스크린샷 |
|------|-----|----------|
| Fixture (골든) | `http://127.0.0.1:9876/fixtures/table.html` | `compare-fixture-table.png` |
| Snapshot (현재 뷰어) | `http://127.0.0.1:9876/snapshots/table.html` | `compare-snapshot-table.png` |

## 비교 요약

- **Fixture**: 왼쪽 2개 셀(위·아래), 오른쪽 1개 병합 셀. 셀 높이 25mm+25mm 반영된 구조. 테이블 위치 left:31mm, top:35.99mm.
- **Snapshot**: 동일 2열 구조이나, 셀 높이·테이블 위치·SVG viewBox 등 수치 차이로 인해 레이아웃이 fixture와 다르게 보일 수 있음 (audit_report.md 참고).

## 재현 방법

1. 테스트 디렉토리에서 HTTP 서버 실행:
   ```bash
   cd crates/hwp-core/tests && python3 -m http.server 9876
   ```
2. 브라우저에서 열기:
   - Fixture: http://127.0.0.1:9876/fixtures/table.html
   - Snapshot: http://127.0.0.1:9876/snapshots/table.html
3. agent-browser로 스크린샷:
   ```bash
   agent-browser open http://127.0.0.1:9876/fixtures/table.html
   agent-browser screenshot --full compare-fixture-table.png
   agent-browser open http://127.0.0.1:9876/snapshots/table.html
   agent-browser screenshot --full compare-snapshot-table.png
   agent-browser close
   ```

## 참고

- audit_report.md: 테이블 래퍼(htb/htG), 셀 높이, SVG viewBox, hls 스타일 불일치
- 2026-02-21-parsed-values-no-constants.md: 상수 제거 후 파싱 값만 사용하는 구현 계획
