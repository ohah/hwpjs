# Fixtures vs 현재 HTML 구현 — 현황 감사 요약

**산출일**: 2026-02-21  
**목적**: fixture HTML(원본)과 현재 뷰어 출력 간 차이 요약. Phase 0 산출물.

## 요약

- **Golden**: `crates/hwp-core/tests/fixtures/*.html` + `*_style.css`
- **비교 대상**: `document.to_html(&options)` → `tests/snapshots/*.html` (및 insta `.snap`)
- **적용 범위**: fixture 매트릭스 기준 동일 stem에 .hwp·.html 모두 있는 10개 fixture.

## 알려진 불일치 (table.hwp 기준)

| 구분 | Fixture (table.html) | 현재 구현 (snapshots/table.html) |
|------|----------------------|-----------------------------------|
| 테이블 래퍼 | `htb`만 (left:31mm, top:35.99mm) | `htG` > `htb` (htG: left:30mm, top:35mm; htb 내부 오프셋) |
| 셀 높이 | 25mm + 25mm (병합 반영) | 50mm 등 상이 |
| SVG viewBox | -2.50 -2.50 46.99 56.99 | -2.5 -2.5 44.99 55 |
| hls 스타일 | line-height:2.79mm, top:-0.18mm | line-height:3.00mm, top:-0.26mm |

## 정규화 규칙 (비교 시)

- Fixture: `<link href="*_style.css">` 제거 후 해당 CSS 내용을 `<style>`로 삽입한 문자열을 golden으로 사용.
- 공백·줄바꿈 정규화 후 비교 (또는 html-compare-rs 등 도구 사용).

## 다음 단계

- Phase 1: table → table2 → table-caption → table-position 순으로 htG/htb, 수치, 포맷 fixture와 맞춤.
- Phase 2: linespacing, lists-bullet 등 나머지 fixture diff 후 수정.
- Phase 3: fixture vs 뷰어 출력 자동 비교 테스트 도입.
