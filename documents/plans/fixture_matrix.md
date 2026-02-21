# Fixture 매트릭스

**산출일**: 2026-02-21  
**목적**: fixtures 디렉터리에서 HTML golden이 있는 fixture 목록 및 수락 기준 적용 대상 정리.

## 매트릭스

| stem | has_hwp | has_html | has_css | priority |
|------|---------|----------|---------|----------|
| linespacing | Y | Y | Y | 2 |
| lists-bullet | Y | Y | Y | 2 |
| multicolumns-in-common-controls | Y | Y | Y | 2 |
| noori | Y | Y | Y | 3 |
| pagedefs | Y | Y | Y | 2 |
| strikethrough | Y | Y | Y | 2 |
| table | Y | Y | Y | 1 |
| table2 | Y | Y | Y | 1 |
| table-caption | Y | Y | Y | 1 |
| table-position | Y | Y | Y | 1 |

- **priority 1**: 테이블 관련 (table, table2, table-caption, table-position) — Phase 1 대상.
- **priority 2**: 그 외 단순 fixture — Phase 2 대상.
- **priority 3**: noori (대용량/참조용) — Phase 2 후반 또는 별도.

## 수락 기준 적용 범위

동일 stem에 `.hwp`와 `.html`이 **둘 다 있는** fixture만 수락 기준 적용. 위 표의 10개 stem이 해당함.

## 참고

- `crates/hwp-core/tests/common.rs`: `find_fixtures_dir()`, `find_all_hwp_files()`, `find_fixture_file()`.
- CSS 파일명: `{stem}_style.css` (예: `table_style.css`).
