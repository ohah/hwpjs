# table-caption / table-position 시각·스냅샷 비교

**캡처일**: 2026-02-21  
**도구**: agent-browser (전체 페이지 스크린샷)

## 1. 스냅샷(HTML) 동일 여부

**동일하지 않습니다.**  
fixture(골든)와 현재 뷰어가 생성한 snapshot HTML은 다릅니다.

| 파일 | Fixture (골든) | Snapshot (뷰어 출력) |
|------|----------------|----------------------|
| table-caption | `fixtures/table-caption.html` (15.7KB) | `snapshots/table-caption.html` (17.8KB) |
| table-position | `fixtures/table-position.html` (40KB) | `snapshots/table-position.html` (40KB) |

**주요 차이 요약**
- **구조/포맷**: Fixture는 한 줄 minified + 외부 CSS(`<link href="*_style.css">`). Snapshot은 인라인 `<style>` + 줄바꿈 포맷.
- **수치**: Fixture는 `line-height:2.79mm`, `top:-0.18mm`, `viewBox` 높이 `9.52mm`, `haN` 고정 `width:2.10mm` 등. Snapshot은 `line-height:3.53mm`, `top:0mm` 또는 `-0.26mm`, `viewBox` `9.53mm`, haN width는 CharShape 기반 계산값 또는 생략.
- **표 7/8 순서·위치**: table-caption fixture는 표7이 1페이지 하단(195.20mm), 표8이 2페이지 상단(35mm). Snapshot은 순서/위치가 다를 수 있음.
- **table-position**: Fixture는 인라인 테이블 htb 높이 9.05mm, viewBox 14.04 등. Snapshot은 htb 높이·viewBox 등이 다를 수 있음.

## 2. 이미지 비교 (agent-browser 캡처)

같은 서버(`python3 -m http.server 9876`)에서 fixture와 snapshot URL을 열고 `agent-browser screenshot --full`로 저장한 파일입니다.

### table-caption

| 구분 | URL | 스크린샷 |
|------|-----|----------|
| Fixture (골든) | `http://127.0.0.1:9876/fixtures/table-caption.html` | `compare-fixture-table-caption.png` |
| Snapshot (뷰어) | `http://127.0.0.1:9876/snapshots/table-caption.html` | `compare-snapshot-table-caption.png` |

### table-position

| 구분 | URL | 스크린샷 |
|------|-----|----------|
| Fixture (골든) | `http://127.0.0.1:9876/fixtures/table-position.html` | `compare-fixture-table-position.png` |
| Snapshot (뷰어) | `http://127.0.0.1:9876/snapshots/table-position.html` | `compare-snapshot-table-position.png` |

## 3. 재현 방법

```bash
cd crates/hwp-core/tests && python3 -m http.server 9876
# 다른 터미널
agent-browser open http://127.0.0.1:9876/fixtures/table-caption.html
agent-browser screenshot --full snapshots/compare-fixture-table-caption.png
agent-browser open http://127.0.0.1:9876/snapshots/table-caption.html
agent-browser screenshot --full snapshots/compare-snapshot-table-caption.png
# table-position도 동일하게 fixture → snapshot 순으로 캡처
```

## 4. 결론

- **HTML 스냅샷**: fixture와 **일치하지 않음** (포맷, 수치, 일부 구조 차이).
- **이미지 비교**: 위 4장을 나란히 보면 레이아웃·캡션 위치·테이블 배치 차이를 시각적으로 확인할 수 있습니다. fixture에 맞추려면 hls 수치(2.79/-0.18), viewBox·htb 높이, 표 7/8 위치, haN width 출처(원본 파싱 vs 계산) 등을 추가로 맞추는 작업이 필요합니다.
