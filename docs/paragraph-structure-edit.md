# 문단 구조 편집

현재 HWP5 일반 문단의 분할·선택 영역 교체 분할·생성 문단 후속 입력/글자 모양/재분할·저장·native 이력·Worker·Canvas Enter를 연결했습니다. HWPX 구조 편집, 문단 병합/삭제/이동, 보호 제어/필드/계산 결과/range의 구조 이동과 전체 조판은 남아 있습니다. 일반 문단 성공을 전체 편집 완료로 읽지 않습니다.

## 현재 모델과 책임 분리

- `Paragraph.source_node: ?u32`는 불변 원본 record provenance입니다. null은 생성 문단이고 0은 유효 원본 node입니다. `originalNode()`는 생성 문단 또는 원본과 template가 동시에 지정된 문단을 거부합니다.
- `header_template`는 생성 문단의 불변 헤더 출처입니다. 별도 Draft 캐시에 중복 보관하지 않습니다. `instance_id`는 직렬화 ID이며 원본 node index나 현재 문단 배열 index와 같다고 가정하지 않습니다.
- `instance_ids.zig`는 모든 원본 section과 현재 모델 ID에서 최소 미사용 양수 u32를 고릅니다. 기존 중복/0을 변경하지 않고 최댓값 wrap·입력 한도·미지원 버전·손상 framing을 검사합니다.
- `paragraph_split.zig`는 소유 left/right 초안을 기존 clone·plain splice·서식 run 검사로 준비합니다. 새 continuation은 별도 ID와 명시적 PARA_BREAK를 소유합니다. 기존 텍스트 레코드가 없는 빈 문단의 ""와 새 문단의 "\\r"은 구분합니다.
- `structure_session.zig`는 section 복사본에서 선택 삭제와 분할을 한 거래로 준비하고 전체 구조 writer 검증 뒤 현재 모델을 교환합니다. 모든 fallible 작업은 교환 이전에 끝납니다.
- `structure_plan.zig`는 현재 배열에서 삽입 위치·템플릿·논리 LIST_HEADER 소유·마지막 문단·count 증가를 도출합니다. 원본 누락/재정렬·위조 parent/template·생성 ID 충돌·count 오버플로를 거부합니다. 파생 계획은 거래 수명에만 존재합니다.
- `paragraph_records.zig`는 공통 record writer·Header offset을 재사용해 생성 Header/Text/CharRuns를 원자적으로 추가합니다. continuation의 나누기 플래그를 복제하지 않습니다. 마지막 문단 MSB는 검증한 논리 범위에서 전달합니다.
- `structure_section_writer.zig`는 원본 문단을 기존 selected writer에 전달하고 생성 문단 삽입·목록 count·기존 마지막 비트 수정 patch를 적용합니다. 동일 삽입 위치의 순서, 겹침, 출력 한도를 검사합니다. 표 셀과 LIST_HEADER의 형제 관계 및 spec6/observed8은 기존 파서/list_groups 계약을 재사용합니다.
- Session의 원본 style_offsets·source_record_count는 불변 출처입니다. 현재 문단 수가 달라져도 zip 순회 trap이 없도록 변경 판정하고 생성 문단이 있는 section에는 구조 writer를 사용합니다.
- 체크포인트는 세션/allocator/format/coverage/section 수·원본 record 수를 바인딩하지만 현재 문단 수 차이는 허용합니다. 원본/생성 provenance 범위를 할당 없이 확인하고 opaque 모델을 교환합니다. 의미 topology는 구조 거래가 소유합니다. [이력 계약](hwp5-edit-history.md)이 크기·rollback·수명을 소유합니다.

source eligibility는 생성 문단의 source_node를 위조하지 않고 template의 원본 소유·확장·metadata와 현재 plain text·ID·parent를 검증합니다. 필드·계산 결과·보호 컨트롤·비어 있지 않은 range는 구조 분할에서 아직 거부합니다. 계산식 owner 탐색은 생성 문단을 원본으로 오인하지 않습니다.

## 공개 API와 Canvas

`splitParagraph({ section, paragraph, atUnit, endUnit = atUnit })`는 현재 UTF-16 코드 유닛 범위를 받습니다. 선택이 있으면 삭제 후 분할이 한 native 명령/이력 항목입니다. JS splice 다음 split 같은 두 명령 우회는 없습니다. 선택적 WASM export는 `hwp5_edit_split`·`hwp5_edit_split_range`이며 이전 제품에서는 구조 명령만 Hwp5StructureAbiUnavailable로 거부합니다. close 뒤에는 EditorClosed입니다. 기본 save는 재조판이 필요하면 계속 거부합니다.

Worker는 native 적용 직후 applied를 설정하고 저장본/readText에서 전체 projection을 새로 만듭니다. 최초 load bytes나 JS 역명령은 복원값이 아닙니다. 실제 export가 있을 때만 structureAvailable을 광고합니다. HWPX 구조 명령은 현재 UnsupportedHwpxStructure입니다.

Canvas는 structureAvailable에 따라 Enter/insertParagraph/insertLineBreak를 split으로 바꾸고 기존 sourceOffsets 변환을 재사용합니다. composition·미반영 draft·명령/이력 대기·busy 동안 구조 요청을 차단합니다. 성공 응답에서 재투영된 오른쪽 문단을 찾아 caret 0으로 옮기고, 거부는 기존 문단/커서를 유지합니다. native 적용 후 projection 오류는 fail-closed 처리합니다.

## 명세와 rhwp 조사

문단 헤더의 unique Instance ID·나누기 플래그·버전별 변경추적/extra는 공식 HWP5 문단 헤더 문서에서 조사했습니다. 신규 헤더의 미지원 tracking/extra는 현재 거부합니다. count MSB만으로 owner를 추정하지 않습니다.

`reference/rhwp/src/document_core/commands/text_editing.rs`의 split_paragraph_native·merge_paragraph_native는 raw_stream 무효화, metadata, 개체 Enter 특례, reflow/composition/pagination과 이벤트를 처리합니다. 셀·머리말/꼬리말·주석은 별도 경로입니다. 관찰한 소스 범위이며 전체 rhwp 정확성의 증거는 아닙니다. 우리 구현은 원본 raw 캐시와 현재 편집 모델을 합치거나 JS 역명령을 도입하지 않습니다.

## 현재 검증 근거

생성 문단의 후속 조합도 실제 charshape·software·table에서 독립 검증했습니다. 최초 분할 저장본→생성 문단에 후속😀 삽입→그 문단을 위치 2에서 재분할→다음 생성 문단의 [0,2) 선택 삭제+분할 각각을 이전 저장본에 대한 독립 whole Section oracle로 대조했습니다. 마지막 두 상태의 undo/redo 전체 저장 bytes도 일치했고 공개 구조 검사 5/5가 통과했습니다. 단순 최종 문단 수 비교만으로 provenance/서식/목록 변화가 맞다고 판단하지 않습니다.

선택 분할도 외부 Chromium에서 실제 software 제목을 클릭하고 ArrowRight·Shift+ArrowRight 두 번으로 [1,3)을 선택한 뒤 Enter→다운로드로 검증했습니다. `/private/tmp/hwpjs-canvas-selection-split.hwp`는 독립 선택 삭제+분할의 전체 Section·비대상 스트림 예상값과 일치했습니다. undo 한 번의 `/private/tmp/hwpjs-canvas-selection-undo.hwp`는 원본 파일 전체 bytes, redo 한 번의 `/private/tmp/hwpjs-canvas-selection-redo.hwp`는 편집 파일 전체 bytes와 같았습니다. 이전 단순 분할 기록의 선택 브라우저 미검증 경계는 이 결과로 해소됐으며 OS IME·한컴 조판은 여전히 별도입니다.

- ReleaseSafe 제품 audit: HWP5 93/93·HWPX 29/29, 9/9 단계. 구조 변경을 포함한 전체 ReleaseSafe native는 2,813/2,813·7/7 단계·종료 코드 0으로 통과했습니다(root 2,804·별도 9). 실행 약 10분·최대 RSS 37 GiB이며 runner의 failed command 표기는 최종 성공 요약·종료 코드와 구분했습니다. 전체 조판·모든 제어 편집 완성의 증거는 아닙니다.
- native structural split 집중 검사 root 포함 4/4: 실제 charshape·software 제목 셀·table 빈 셀의 문단 수, strict 저장 거부, opt-in 저장/재열기 모든 문단 raw bytes, undo 원본/reflow·redo 편집본, 생성 문단 후속 입력·서식·재분할. 선택 삭제+분할의 모든 할당 실패와 redo 보존, 성장 한도 rollback을 포함합니다.
- 공개 구조/Worker 집중 10/10: 원본/편집 저장값·단일 이력·잘못된 정수/서로게이트 절단·거부/close, 구형 모듈 호환성. optional export 이름만 동일 길이로 바꾼 실제 WASM instantiate로 부재를 재현했습니다. 이 검사에서 Worker의 무조건 true capability 광고를 찾아 수정했습니다.
- 독립 `tests/hwp5/style-preservation/structure-record-oracle.mjs`: CFB.js·Node raw DEFLATE·독립 framing/level ancestry/형제 목록으로 ID·owner·마지막 문단·좌우 text/run·count 예상값을 만들고 Section 전체 bytes 및 비대상 스트림을 비교합니다. 제품 offsets/model snapshot을 가져오지 않습니다. 시작/중간/끝·선택 삭제 분할 및 무시된 편집 결과를 잡는 반례를 포함합니다.
- `node tools/hwp5-split-corpus-audit.mjs` 두 차례: 추적 HWP 48개, 배포 2·암호화 1 열기 거부, 3,538회 위치 시도 중 2,425회 독립 전체 Section/스트림·undo/redo 통과. UnsupportedStructuralControl 630회·UnsupportedSectionControl 483회는 원본과 기존 redo 가용성/저장값 보존을 확인했습니다. 검증 실패 0. 세 위치 검사이지 모든 선택 조합·제어 지원·조판 완료의 증거는 아닙니다.
- Canvas/공개 구조 모사 DOM 결합 27/27: 선택 Enter 단일 요청, 오른쪽 caret, 대기 중 중복 요청·IME 조합 요청 차단, 후속 입력. 실제 OS IME 증거는 아닙니다.
- 외부 Chromium E2E: software 공모 참가신청서 Canvas 클릭→ArrowRight→Enter→오른쪽 문단 "분할😀" 입력→다운로드. 101→102문단·caret 0:2:1→0:3:0, 독립 분할+후속 splice 전체 Section/스트림과 native 재열기 통과. undo 두 번 원본 전체 bytes·redo 두 번 편집 전체 bytes 일치. 임시 증거 `/private/tmp/hwpjs-canvas-split-e2e.hwp`·`hwpjs-canvas-split-undo.hwp`·`hwpjs-canvas-split-redo.hwp`·직접 확인한 `hwpjs-canvas-split-e2e.png`. 선택 분할의 실제 브라우저·OS 한국어 IME·한컴 조판은 별도입니다.

초기 ID/provenance/draft/plan/writer 기반 단계의 집중 검사도 있었지만 위 결합 검증이 현재 연결 상태의 근거입니다. 초기의 "Session/Canvas 미연결"은 현재 제한으로 유지하지 않습니다. 첫 공개 검사의 빈 셀 ""/신규 "\\r" 기대값 오류는 둘을 구분해 수정했고 재열기 비교는 실제 bytes를 엄격히 검사합니다.

## 남은 구현과 검증

1. HWP5 병합·삭제·이동과 같은 owner 경계 검증 및 원본 레코드 제외 저장.
2. 보호 제어·필드·계산식·range의 구조 이동 의미와 독립 검증. 서로 다른 셀/목록/구역 간 무조건 병합은 허용하지 않습니다.
3. HWPX 생성/분할/병합을 XML provenance·현재 paragraph/run/site 및 ZIP 저장에 연결.
4. Canvas 경계 Backspace/Delete, 문단 간 선택/caret와 추가 브라우저/OS IME 검증.
5. 반복 분할 비용 개선: plan의 생성 ID 충돌과 다음 동일 owner 검색은 현재 반복 순회입니다. 파생 인덱스 최적화와 대규모 실측이 필요하며 작은 fixture 통과를 성능 보장으로 읽지 않습니다.
6. 전체 native·현재 문서 해시 검증, 모든 관련 corpus와 브라우저/OS IME, 실제 조판.

원본의 개체·필드·표·조판을 삭제하는 축소 구현이나 신규 문단의 위조 원본 바인딩은 전체 목표의 대체가 아닙니다.
