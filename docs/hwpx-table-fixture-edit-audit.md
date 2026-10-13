# 실제 중첩 표 문서의 전체 문단 입력 검사

## 검증 범위

2026-10-13 현재 후보 `field-label-display-owned-api`의 SHA256은 `39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f`입니다. 기본 제품 WASM은 승격하지 않았으며 로컬 native 후보 결과를 원격 native 구현 완료로 소급하지 않습니다.

일반 경로는 `tools/hwpx-edit-corpus-audit.mjs --wasm=<후보> --fixture=<원본> --history`, 전용 경로는 `tools/hwpx-specialized-input-audit.mjs --wasm=<같은 후보> --fixture=<같은 원본>`으로 실행했습니다. 각 명령은 한 원본의 모든 문단을 검사하고 원본 해시 불변을 확인합니다. 두 파일의 네 실행 모두 최종 집계와 종료코드0을 확인했습니다.

| 원본 | 문단 | 일반 prefix 성공/원문 이력 복원 | 전용 앵커 prefix 성공/독립 XML | 최종 미처리 |
| --- | ---: | ---: | ---: | ---: |
| `legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx` | 490 | 472 | 18 | 0 |
| `reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx` | 168 | 166 | 2 | 0 |

입력 SHA256은 table-bug가 `1f5083c031380a2b2d70605b0417f12bc639b4cb36e711f510c423e5f1bbc28d`, 의료장비 파일이 `44df8d22f30621f01a88ce981dae1a4d89d9cc417b54623a0986f286905bb991`입니다. 공통 `combineEditCounts`로 각 실제 집계를 대조한 결과 두 파일 모두 `all_paragraph_prefixes_verified`, remaining=0입니다. 일반 거부20개를 전용 성공과 중복 합산하지 않습니다.

## 실제 확인한 동작

일반 경로는 매 문단 시작에 비숫자 Unicode/XML 특수문자/CR prefix를 입력하고 저장 reader projection, revision 변화, undo 원본 ZIP 바이트 복원, redo 저장 바이트 복원을 확인했습니다. 성공638문단 모두 이력을 복원했습니다. 일반 입력의 UnsupportedParagraphControl 거부는 table-bug18개·의료장비2개이며, 이 문단들은 전용 앵커 경로에서 처리됐습니다. 거부 시 이전 redo 보존은 각각18회·1회입니다. 첫 거부 전에 이전 성공이 없으면 redo가 없으므로 거부 개수와 보존 횟수가 항상 같지는 않습니다.

전용 경로20문단은 독립 Python ZIP/XML oracle을 일반 및 `-O` 실행으로 검사했습니다. 전체 대상 XML과 비대상 payload를 비교하고 저장본 native 재열기·undo/redo를 확인했습니다. 전용 경로의 최종 거부는0입니다.

## 아직 주장하지 않는 것

전체 문단 감사 결과는 **두 실제 파일의 모든 문단 시작 입력**입니다. 일반638문단의 전체 XML 독립 검사는 그 감사에 포함되지 않았습니다. 아래 별도 위치 표본 검사를 전체638문단에 소급하지 않습니다. 모든 표·도형 속성 명령, 모든 픽스쳐, 실제 브라우저 UI, 원본 한글 조판 동치, native 전체 빌드 gate 통과를 뜻하지 않습니다. 제목만 편집한 이전 회귀보다 범위는 넓지만 전체 목표 완료 증거는 아닙니다.

## 원문에서 선택한 위치별 독립 XML 검사

`HWPJS_TEST_WASM=<같은 후보> node tools/run-selected-node-tests.mjs tests/hwpx/table-fixture-splice-positions.test.mjs`는 독립 Python ZIP/XML로 직접 plain text leaf 문단을 먼저 분류합니다. 각 존재하는 body/cell/drawing 범주에서 문서 순서의 첫·중간·마지막 문단을 선택합니다. 빈 문단·인라인 제어·텍스트 내부 제어·run 없는 문단은 이 plain oracle 범위에서 제외하며 편집 미지원으로 판정하지 않습니다.

table-bug의 원문 표본 모수는 body42·cell232·drawing1문단이며 선택7문단에서48건을 실행했습니다. 의료장비의 모수는 cell40문단뿐이고 선택3문단에서21건입니다. 시작·중간·끝 삽입, 해당 grapheme 치환, 마지막 grapheme 삭제를 수행하며 중복 위치는 한 번만 검사합니다. 모든 저장본69개를 기존 `hwpx-plain-splice-oracle.py`의 일반 및 `-O` 실행으로 전체 XML·비대상 payload·ZIP 메타데이터까지 확인했습니다. 각 파일 첫 변경의 잘못된 기대 텍스트는 실제 Whole XML mismatch로 거부되며 인프라 오류를 통과로 취급하지 않습니다.

별도 native 편집기로 저장본 재열기/그대로 재저장, undo 원본 ZIP 바이트 복원, redo 저장 바이트 복원도69건 모두 통과했습니다. 정확한 테스트2/2, skip0, 종료코드0입니다. 최초 의료장비 파일에 일반 본문 표본이 있다고 가정한 harness 오류는 독립 inventory의 실제 cell-only 구조로 교정했습니다. 검사는 모수315문단 중 선택10문단이며 임의 위치의 전수 독립 검증으로 계수하지 않습니다.

페이지 배치·셀 밖 원문 폭 표시·제품 혼합 진입점의 증거는 [표 배치 계약](hwpx-table-anchor-refusals.md)이 소유합니다. 입력 감사 성공과 레이아웃 성공은 별도 축으로 유지합니다.
