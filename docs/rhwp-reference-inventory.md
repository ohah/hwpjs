# rhwp 참조 출처와 사용 범위

조사 기준 `450c3a62d`와 당시 작업 트리의 소스·서드파티 고지·주제별 검증 기록에서 확인한 참조 목록입니다. 이 문서는 참조가 전혀 없었던 독립 구현을 증명하지 않으며, 기록되지 않은 모든 과거 열람을 복원한 원장도 아닙니다. 참조 파일 수나 문자열 검색 횟수를 코드 이식 규모로 계산하지 않습니다.

## 구현 방식

아래는 과거 구현 방식의 기록입니다. 사용자 결정 이후 새 구현과 대체 작업은 [클린룸 우선 구현 방침](clean-room-policy.md)을 따릅니다. 과거 열람·참조 이력이 이 방침 변경으로 없어지는 것은 아닙니다.

프로젝트는 공식 포맷 명세를 우선하고 MIT 등 허용된 오픈소스의 참조·재사용을 허용하는 방식으로 진행했습니다. 타 구현 코드를 보지 않는 클린룸 절차는 운영하지 않았습니다. 따라서 코드 정리·책임 분리를 뜻하는 클린코드와 독립 출처 절차인 클린룸을 구분합니다. 참조 사실과 범위는 아래 원장과 원본 고지를 함께 확인해야 합니다.

## 코드·알고리즘·데이터의 이식 또는 재구현이 명시된 항목

| 항목 | 실제 작업물 | 참조 내용과 고지 |
| --- | --- | --- |
| 배포용 ViewText 키 유도 | `src/hwp5/distribution/key.zig` | `parser/crypto.rs`의 MSVC LCG/XOR 키 유도 재구현. AES는 Zig 표준 라이브러리. envelope·한도·검사 전체를 이식한 것은 아님. 루트 `THIRD_PARTY_NOTICES.md`와 `licenses/rhwp-MIT.txt`에 고지 |
| 구형 암호 키 유도 | `src/hwp5/password_legacy_key.zig`, `tools/hwp5-legacy-password-probe.mjs` | `rhwp-password-crypto`의 UTF-16LE rolling/packing 방식. revision `e8800c8def63449808a4092798442652ed460552`, 소스와 `docs/third-party-notices.md`에 MIT 고지 |
| HFT ASCII 글자 폭 | `web/preview/hft-ascii-metrics.mjs` | 같은 revision의 `font_metrics_overlays.rs` 측정/보간 폭 190개. 글꼴 파일·윤곽·전체 shaping은 가져오지 않음 |
| HFT 한글 글자 폭 | `web/preview/hft-hangul-metrics.mjs` | 같은 revision의 `FONT_276_HANGUL`과 두 글꼴 overlay 연결. 제한된 보통체 완성형 한글 advance 프로필 |
| 화살표 크기 계산 | `web/preview/arrow-reference-dimensions.mjs` | 같은 revision의 `web_canvas.rs::calc_arrow_dims` 정책을 적용. 선 두께·크기 단계·선 길이 비율. 공식 한글 치수라는 주장 아님 |

HFT 두 파일은 `measured-font-width.mjs`, 화살표 계산은 `decorated-line-plan.mjs`, 키 유도는 각각 배포용/암호 스트림 처리에서 실제 참조됩니다. 고지는 루트와 `docs/third-party-notices.md`에 나뉘어 있습니다. 정규 공개 패키지 builder는 후자를 포함해 라이선스 고지를 조립합니다. 이 원장은 법적 적합성 전수 감사를 대신하지 않습니다.

## 동작·정책을 참고해 별도로 구현하거나 비교한 항목

| 기능군 | 사용한 내용과 경계 | 작업물·기록 |
| --- | --- | --- |
| 중립 문자 언어 상속 | 문장부호가 주변 언어별 글꼴을 따르는 정책. 문단 커서 구현과 일부 분류는 별도 | `web/preview/font-language-context.mjs`, [계약](font-language-context.md) |
| 표 페이지 분할 | CELL/TABLE의 RowBreak/CellBreak 매핑과 행 보존 동작 비교. 명세와 다른 설명을 그대로 정답으로 취급하지 않음 | [표 흐름](hwpx-table-page-flow.md), [행 경계 정책](table-row-break-policy.md) |
| 표 반복 제목 | 상단 연속 제목 블록과 본문에 흩어진 제목 셀 구분 | [반복 제목](repeated-table-headers.md) |
| 표 위치·셀 여백 | 부동 표 x 좌표, hasMargin과 표 inMargin 선택. RHWP의 문맥별 fallback 전체를 채택하지 않음 | [표 흐름](hwpx-table-page-flow.md) |
| 셀 높이·비정상 여백 | 부호처럼 보이는 상위 비트 값의 표시 정책 비교. i16 변환 실패를 0으로 바꾸는 보정은 채택하지 않음 | [셀 높이](hwp5-signed-cell-height.md), [여백 진단](table-cell-measurement-diagnostics.md) |
| 셀 마지막 문단 간격 | 마지막 문단 뒤 간격 제외 동작 대조. 첫 문단 앞 간격 정책까지 자동 적용하지 않음 | [마지막 간격](cell-terminal-paragraph-spacing.md) |
| 셀 안 그림 정렬 | issue_2071의 셀 기준 수직 정렬 관측 참고. 제한된 소유권·배치 프로필만 적용 | `web/preview/cell-picture-effective-alignment.mjs` |
| 그림·도형 정렬 | 끝 정렬 offset 방향, INSIDE/OUTSIDE 호환 방향. 양면 페이지 전체 동치 아님 | `web/preview/drawing-placement.mjs`, [그림 배치](canvas-picture-placement.md) |
| 직선 연결선 | 제한된 terminal 제어점 직선 경로, 원본을 덮어쓰지 않는 표시 계획 | `web/preview/connector-reference-path.mjs`, [선 원값](hwpx-line-shape-source.md) |
| 곡선 표시 선폭 | 미리보기 최소 0.5px 정책. 원본 선폭 수정·공식 인쇄 치수 주장 아님 | `web/preview/curved-shape-paint-plan.mjs` |
| 도형 공통 꼬리 | raw_extra 보존 및 선택 필드의 남은 길이 검사 관측. 패딩/종결자라고 단정하지 않음 | [꼬리 관측](hwp5-drawing-object-extras.md), [부분 미리보기](hwp5-drawing-object-extra-preview.md) |
| 패턴 선 enum | 숫자 의미를 대조했지만 RHWP만 근거로 DOT/DASH를 뒤바꾸지 않음 | [패턴 선](hwp5-patterned-lines.md) |
| 빈 줄 페이지 넘침 | 쪽당 최대 두 빈 줄의 제한된 호환 프로필. 공식 명세 수치·모든 다단 규칙 아님 | `web/preview/empty-line-page-policy.mjs`, [빈 줄 페이지](empty-line-pagination.md) |
| 머리말·꼬리말 선언 | 선언 시작 쪽·홀짝 우선·후속 대체 정책. 실제 소유 좌표 연결은 별도 구현 | `web/preview/page-area-declaration-selection.mjs`, [계약](page-area-declaration-selection.md) |
| 글꼴/조판 호환 옵션 | corpus의 레코드·0값 및 bold fallback 비교. 옵션 전체 효과를 확정하지 못한 부분 있음 | [조판 옵션 조사](hwp5-font-layout-reference.md), [HFT 폭](hft-measured-font-width.md) |
| 수식 lexer·AST·기호 | 모듈 책임, 항 결합, 제한된 기호 매핑 비교. 코드 이식·전체 토큰/조판 동치 아님 | [lexer](equation-lexer.md), [AST](equation-structural-parser.md), [기호](equation-symbols.md) |
| 차트 모델·편집 UI | 원본 보존과 표시 모델 분리, 포인트/계열 격자 방향 참고 | [표시 모델](hwpx-chart-display-model.md), [차트 격자](hwpx-chart-grid-ui.md) |
| 차트 표현 선택 | OOXML/legacy/EMF/WMF 선택 순서 조사. 빈 XML 성공 처리·경로 추정·상한을 그대로 채택하지 않음 | [차트 표현 한계](hwpx-chart-stock-gaps.md) |
| 미해결 필드 링크 | stack/orphan 연결 설계 차이 조사. 종료 마커 합성이나 strict 제거의 근거로 삼지 않음 | [reader 감사](reference-reader-release-audit.md), [필드 밖 편집](hwpx-unmatched-field-exterior.md) |
| 필드 editable·dirty | 비트와 저장 동작 비교. editable=0을 일반 편집 전체 금지로 해석하지 않음 | [필드 편집](hwpx-field-text-edit.md) |
| 번호 표시 | 한글/한자 조합 표기 비교. 명세와 다른 binary code 6/7/8 매핑은 비채택 | [번호 표시](number-format-display.md) |
| 조건부 문단 여백 | 들여쓰기·홀수 여백·정수 나눗셈/default 복원 조사. 불명확한 절대값 변환은 비채택 | [조건부 문단 서식](hwpx-paragraph-display-switch.md) |
| 명령 registry·도구 모음 | dispatcher와 현재 서식 상태의 책임 분리 참고. UI/Native mutation 코드 전체 복제 아님 | [명령 registry](document-command-registry.md) |

## 새로 진행한 공개 API 흐름 참고

[MCP 읽기 세션](mcp-document-sessions.md)은 rhwp 0.9.0의 open→repeat read→close 사용 흐름을 참고합니다. 공식 MCP SDK와 hwpjs 기존 파일/엔진/문서 모델로 별도 구현하며 rhwp 서버 코드 이식이나 편집 누적/save 지원 완료가 아닙니다.

## 검증·자료 사용

- `reference/rhwp/samples` 문서들을 회귀 fixture와 실제 실패 재현에 사용했습니다. 표·그림·수식·차트·메모·필드·암호 문서 등의 표본이며, fixture 사용은 구현 코드 이식과 다릅니다. corpus 안 문서 자체의 출처/권리는 저장소 코드 라이선스와 자동 동일시하지 않습니다.
- [같은 Noori 작업 비교](rhwp-same-document-comparison.md)는 두 엔진의 읽기·그림 추출·치환·저장·교차 재열기를 비교했습니다.
- [읽기 비용 검증](hwpx-read-cost.md)은 고정된 공개 rhwp 0.9.0 Node/WASM과 로컬 hwpjs의 성능·본문 검사를 구분합니다.
- 이번 0.9.0 기능 감사는 `zig-out/verification/rhwp-feature-audit-v090/`에 정확한 태그/npm gitHead·WASM/CLI 지문·실제 MCP 목록·표/메모 API 검사·무편집 저장 비교를 보존합니다. 공개 API의 동작 참고이며 코드 포트가 아닙니다.
- `unknown-reader-parity-current.md`의 RHWP corpus 검사는 hwpjs 두 후보를 같은 문서 집합으로 비교한 기록도 포함합니다. 이를 모두 rhwp 엔진과의 출력 동치 검사로 부르지 않습니다.
