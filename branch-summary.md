# feat/table-layout-fixture-match

## Purpose

HTML 테이블 뷰어 출력을 fixture(원본)와 맞추기 위한 변경입니다. table2 캡션/테이블 순서, htb 스타일, 누적 세로 위치, 캡션 hls 계산을 수정하고, 레이아웃 비교용 스크린샷과 보고서를 추가했습니다.

## Description

- **같은 문단 내 여러 absolute 테이블**: fixture table2처럼 DOM 출력 순서를 **top_mm 내림차순**으로 통일(표2 → 표1). 다음 테이블 기준 위치는 `next_para_vertical_mm`으로 누적하며, **htG 높이**를 사용해 캡션·마진을 포함한 블록 높이로 계산.
- **render_table 반환값**: `(String, Option<f64>)`로 변경. htG를 쓰는 경우 실제 사용한 htG 높이(mm)를 반환해 paragraph에서 다음 테이블 세로 위치 계산에 사용.
- **htb 스타일**: fixture와 동일하게, **인라인 테이블이면서 캡션 없을 때만** htb에 `display:inline-block;position:relative;vertical-align:middle;` 적용. 캡션 있거나 like_letters=false(absolute) 테이블은 htb에 해당 스타일 없음.
- **캡션 hls**: LineSegment가 없을 때 `default_hls_from_document(document, caption_char_shape_id)`로 **캡션 문단의 CharShape**를 사용하도록 변경. `hls_from_char_shape` 추가, docinfo `CharShape` 기준 line_height/top 계산.
- **스냅샷**: table, table2, table_position, borderfill, table_caption, multicolumns HTML 및 insta `.snap` 갱신. size.rs rustfmt 적용.
- **레이아웃 비교**: `layout-comparison-report.md` 추가, agent-browser로 fixture/snapshot 전체 페이지 스크린샷(table, table2, table-caption, table-position) 촬영 후 `layout-fixture-*.png`, `layout-snapshot-*.png`로 저장.
- **추가 스냅샷**: table 시각 비교용 `compare-fixture-table.png`, `compare-snapshot-table.png`, `compare-table-visual.md` 및 borderfill snapshot, multicolumns-in-common-controls fixture/snapshot 레이아웃 스크린샷 추가.

## How to test

- `bun run test:rust` 또는 `bun run test:rust-core` 실행 후 전체 통과 확인.
- `bun run test:rust:snapshot` 실행 후 스냅샷 일치 확인.
- (선택) `crates/hwp-core/tests`에서 `python3 -m http.server 9876` 실행 후 `http://127.0.0.1:9876/fixtures/table2.html`, `http://127.0.0.1:9876/snapshots/table2.html` 등에서 레이아웃 비교.

## Additional info

- hls 2.79mm / -0.18mm는 fixture와 동일하게 맞추지 않음. 현재는 문서/캡션 CharShape에서 계산한 값 사용.
- viewBox 9.52 vs 9.53, haN width 등 세부 수치 차이는 별도 이슈로 남겨둠.
