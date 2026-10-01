# 문단 구조 편집

현재 HWP5 일반 문단의 분할·선택 영역 교체 분할·같은 논리 owner의 인접 문단 병합·생성 문단 후속 입력/글자 모양/재분할·저장·native 이력·Worker·Canvas Enter/경계 Backspace/Delete를 연결했습니다. HWPX 구조 편집, 독립 문단 삭제/이동, 보호 제어/필드/계산 결과/range의 구조 이동과 전체 조판은 남아 있습니다. 일반 문단 성공을 전체 편집 완료로 읽지 않습니다.

## 현재 모델과 책임 분리

- `Paragraph.source_node: ?u32`는 불변 원본 record provenance입니다. null은 생성 문단이고 0은 유효 원본 node입니다. `originalNode()`는 생성 문단 또는 원본과 template가 동시에 지정된 문단을 거부합니다.
- `header_template`는 생성 문단의 불변 헤더 출처입니다. 별도 Draft 캐시에 중복 보관하지 않습니다. `instance_id`는 직렬화 ID이며 원본 node index나 현재 문단 배열 index와 같다고 가정하지 않습니다.
- `instance_ids.zig`는 모든 원본 section과 현재 모델 ID에서 최소 미사용 양수 u32를 고릅니다. 기존 중복/0을 변경하지 않고 최댓값 wrap·입력 한도·미지원 버전·손상 framing을 검사합니다.
- `paragraph_split.zig`는 소유 left/right 초안을 기존 clone·plain splice·서식 run 검사로 준비합니다. 새 continuation은 별도 ID와 명시적 PARA_BREAK를 소유합니다. 기존 텍스트 레코드가 없는 빈 문단의 ""와 새 문단의 "\\r"은 구분합니다.
- `structure_session.zig`는 section 복사본에서 선택 삭제와 분할을 한 거래로 준비하고 전체 구조 writer 검증 뒤 현재 모델을 교환합니다. 모든 fallible 작업은 교환 이전에 끝납니다.
- `structure_plan.zig`는 현재 배열에서 삽입 위치·템플릿·논리 LIST_HEADER 소유·마지막 문단·count 증감을 도출합니다. 기본 경로는 원본 누락을 거부하고 명시적 deletion 경로만 제거될 plain 원본 subtree를 검사합니다. 재정렬·위조 parent/template·생성 ID 충돌·count 오버플로·빈 목록을 거부합니다. 파생 계획은 거래 수명에만 존재합니다.
- `paragraph_merge.zig`는 양쪽 plain content와 공통 character_runs.join에서 소유 병합 초안을 만듭니다. `paragraph_merge_scope.zig`는 공통 paragraph_owner.logicalOwner로 인접 두 문단이 같은 논리 목록에 속하는지 확인합니다. `merge_session.zig`는 복사본의 오른쪽 문단 제거·남은 생성 template 재바인딩과 전체 writer 검증을 완료한 뒤 현재 section을 교환합니다.
- `paragraph_records.zig`는 공통 record writer·Header offset을 재사용해 생성 Header/Text/CharRuns를 원자적으로 추가합니다. continuation의 나누기 플래그를 복제하지 않습니다. 마지막 문단 MSB는 검증한 논리 범위에서 전달합니다.
- `structure_section_writer.zig`는 원본 문단을 기존 selected writer에 전달하고 생성 문단 삽입·목록 count·기존 마지막 비트 수정 patch를 적용합니다. 동일 삽입 위치의 순서, 겹침, 출력 한도를 검사합니다. 표 셀과 LIST_HEADER의 형제 관계 및 spec6/observed8은 기존 파서/list_groups 계약을 재사용합니다.
- Session의 원본 style_offsets·source_record_count는 불변 출처입니다. 현재 문단 수가 달라져도 zip 순회 trap이 없도록 변경 판정하고 생성 문단이 있는 section에는 구조 writer를 사용합니다.
- 체크포인트는 세션/allocator/format/coverage/section 수·원본 record 수를 바인딩하지만 현재 문단 수 차이는 허용합니다. 원본/생성 provenance 범위를 할당 없이 확인하고 opaque 모델을 교환합니다. 의미 topology는 구조 거래가 소유합니다. [이력 계약](hwp5-edit-history.md)이 크기·rollback·수명을 소유합니다.

source eligibility는 생성 문단의 source_node를 위조하지 않고 template의 원본 소유·확장·metadata와 현재 plain text·ID·parent를 검증합니다. 필드·계산 결과·보호 컨트롤·비어 있지 않은 range는 구조 분할에서 아직 거부합니다. 계산식 owner 탐색은 생성 문단을 원본으로 오인하지 않습니다.

## 공개 API와 Canvas

`splitParagraph({ section, paragraph, atUnit, endUnit = atUnit })`는 현재 UTF-16 코드 유닛 범위를 받습니다. 선택이 있으면 삭제 후 분할이 한 native 명령/이력 항목입니다. JS splice 다음 split 같은 두 명령 우회는 없습니다. 선택적 WASM export는 `hwp5_edit_split`·`hwp5_edit_split_range`이며 이전 제품에서는 구조 명령만 Hwp5StructureAbiUnavailable로 거부합니다. close 뒤에는 EditorClosed입니다. 기본 save는 재조판이 필요하면 계속 거부합니다.

`mergeParagraph({ section, paragraph })`는 현재 배열의 해당 문단에 인접 오른쪽 문단을 합치는 단일 native 명령입니다. 같은 parent만으로는 부족하며 같은 논리 owner를 요구합니다. 왼쪽 문단 서식/ID/provenance는 유지하고 양쪽 글자 서식은 공통 run join으로 연결합니다. 선택적 export `hwp5_edit_merge`가 없으면 Hwp5StructureAbiUnavailable입니다. Worker는 독립 mergeAvailable을 광고하고 Canvas 경계 삭제는 해당 capability에서만 요청합니다.

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

## 병합 기반 단계의 검증 이력

아래 기록은 병합 구현을 쌓아 올린 각 시점의 증거입니다. 해당 시점의 "미연결/별도/남아 있음"은 현재 지원 제한이 아닙니다. 현재 계약은 위 책임·공개 API 절과 아래 공개 병합 후속 실측을 따릅니다.

後속 native 병합 집중 검사는 실제 software·table에 split 저장본을 다시 열어 두 원본 셀 문단을 만들고, 오른쪽 원본의 생성 continuation을 남긴 상태에서 병합합니다. 제거된 원본 template가 남은 생성 문단에 유지되지 않도록 left template로 재바인딩하고 전체 text 재열기·문단 수·undo/redo bytes를 대조했습니다. 별도 원본 두 문단 병합에서는 목록 수 감소 후 공통 Groups가 실제 문단 수와 count를 검증합니다. open·checkpoint·첫 병합·undo 후 재병합의 모든 할당 실패 주입은 원본 저장값·redo를 보존하고 redo 후 병합 저장값이 동일함을 검사했습니다. native paragraph merge 집중 검사 root 포함 4/4가 통과했습니다. 원래 software의 서로 다른 셀 병합 거부/원본 보존도 Session 경계에 추가했습니다. 독립 decoder·공개 API/UI·전체 native는 아직 별도입니다.

native merge_session가 Session.merge_paragraph에 연결됐습니다. 원본 Section 정책·현재 삭제 포함 topology·인접 동일 논리 owner·양쪽 source/content 적격성을 검사하고 Section 초안에서 병합·오른쪽 제거·남은 생성 template 재바인딩을 준비합니다. 전체 삭제 포함 직렬화 검증 후 한 번 교환하며 저장은 생성 문단 또는 원본 문단 수 감소 때 같은 writer를 사용합니다. 병합 후 분할도 삭제 포함 writer로 검증합니다. 실제 charshape 원본 두 문단 병합·CFB 저장/재열기·undo 원본 bytes·redo 편집 bytes·후속 split/저장/undo 집중 검사 root 포함 2/2가 통과했습니다. 최초 실측에서 현재 모델의 병합값과 달리 저장이 원본 텍스트 길이를 유지하는 오류를 재현했습니다. 원인은 병합 초안의 range_tags=null(미투영)을 유지해 기존 selected writer의 현재 텍스트 직렬화 경로가 꺼졌던 것입니다. 다른 편집기와 같은 명시적 빈 range 상태를 소유하도록 수정해 엄격 저장/재열기 검사를 통과했습니다. 이 상태는 복제·equality·이력에 포함되는 현재 모델이며 JS dirty cache를 추가하지 않았습니다. 중첩 목록·병합 전체 할당 실패·독립 oracle·공개 WASM/UI는 아직 별도입니다.

선택적 structure_section_writer.writeWithDeletions는 제거될 원본 문단을 불변 source projection으로 기존 selected writer의 임시 입력에만 채워 framing/mapping을 유지한 뒤 그 subtree를 삭제 patch로 제외합니다. 현재 모델에 원본 문단을 재삽입하거나 별도 편집값을 저장하지 않습니다. 현재 순서의 owner별 마지막 문단 MSB와 생성 문단의 last 상태를 재계산하고 LIST_HEADER는 원본 count+생성 수-제거 수로 갱신합니다. 기본 write 경로는 여전히 삭제를 허용하지 않습니다. 실제 charshape 제거 저장/재열기 모든 문단 text·ID·개수와 전체 writer 할당 실패를 검사해 structural 결합 11/11이 통과했습니다. 아직 중첩 목록 감소·독립 삭제 oracle·Session 병합·CFB 저장·UI까지의 검증은 남아 있으며 이 결과를 공개 병합 완료로 읽지 않습니다.

구조 계획에 거래 수명의 removals/list_removals를 추가했습니다. opt-in buildWithDeletions만 원본 header 누락을 제거 대상으로 도출하고 원본 순서/중복 위조는 계속 거부합니다. 제거 대상의 보호 컨트롤·미해석 하위 레코드·범위·header 확장을 거부하고 논리 목록 감소 및 빈 목록을 검사합니다. 기존 build/writer는 여전히 삭제를 허용하지 않아 지원 전 삭제가 저장에 조용히 반영되지 않습니다. 실제 charshape 원본 문단 하나를 현재 모델에서 제외했을 때 정확한 source node 도출·기본 경로 거부·모든 할당 실패를 확인했으며 기존 split/plan 등 structural 필터 결합 11/11이 통과했습니다(다른 주제 structural 이름 검사도 포함). 삭제 patch·최종 마지막 문단 MSB 재계산·Session 병합 저장은 아직 남아 있습니다.

`paragraph_owner.logicalOwner`가 원본 header의 root/null 또는 LIST_HEADER 범위를 판정하는 공통 함수입니다. 기존 text owner validation과 structure_plan도 이 함수를 사용해 별도 목록 소유 추측을 제거했습니다. `paragraph_merge_scope.zig`는 현재 배열의 인접 두 문단에서 원본/generated template provenance·부모·공통 논리 owner와 지원된 owner 종류를 검사합니다. 전체 topology 및 source/content 적격성은 상위 거래의 별도 책임입니다. 실제 software의 같은 parent·서로 다른 셀 목록 인접 문단을 모두 거부하고 같은 셀의 split pair는 허용했으며 잘못된 마지막 index·모든 할당 실패도 검사했습니다. 병합 draft/scope 집중 검사는 root 포함 3/3, 공통화 후 기존 structural plan 집중 검사는 2/2가 통과했습니다. 병합 Session과 삭제 저장까지의 연결 증거는 아닙니다.

`paragraph_merge.zig`는 검증된 인접·동일 논리 owner를 상위 계층에서 전달한다는 계약의 plain 병합 소유 초안입니다. 부모 불일치·필드/계산 결과·nonempty range를 거부하고 shared plain content·run validator/join·clone을 재사용합니다. 왼쪽 끝 PARA_BREAK만 제외하고 오른쪽 전체 텍스트를 합쳐 하나의 끝 표식을 소유하며 왼쪽 provenance/문단 서식은 유지합니다. 길이/u32 한도와 모든 allocation 실패를 검사합니다. 같은 parent만으로 서로 다른 표 셀을 병합할 수 있다는 뜻이 아닙니다. 실제 charshape 시작/중간/끝 split→merge의 원본 raw text·모든 코드 유닛/tail의 style·ID, forged parent/field/range 거부와 전체 할당 실패가 ReleaseSafe root 포함 2/2로 통과했습니다. Session 명령·원본 삭제 저장·목록 감소·독립 전체 파일 oracle은 아직 연결하지 않았습니다.

병합 기반의 첫 단계로 공통 character_runs.join을 추가했습니다. 검증된 두 run 배열을 받아 왼쪽 끝 표식 직전까지만 유지하고 오른쪽 전체 run을 이동하며 같은 인접 style을 기존 append 규칙으로 합칩니다. 오른쪽의 terminator/tail affinity, 빈 왼쪽 문단, u32 위치 오버플로·run 개수 한도를 검사합니다. 독립 단위별 style 기대값과 모든 할당 실패 집중 검사는 ReleaseSafe root 포함 2/2로 통과했습니다. 최초 필터 실행은 root만 1/1이어서 새 검사가 실행되지 않았으며 root의 명시적 import를 추가해 2/2를 재확인했습니다. 실제 문단 병합 거래·삭제 레코드 저장·목록 count 감소·Canvas 경계 삭제는 아직 연결하지 않았습니다. 이 후속 기반은 위 커밋 단계의 전체 native 2,813개 결과에 포함되지 않습니다.

## 남은 구현과 검증

1. HWP5 독립 삭제·이동 및 보호 제어를 포함한 구조 편집. 일반 인접 병합의 owner 경계·원본 제외 저장은 연결됐으며 전체 컨트롤 구조 편집 완료와 구분합니다.
2. 보호 제어·필드·계산식·range의 구조 이동 의미와 독립 검증. 서로 다른 셀/목록/구역 간 무조건 병합은 허용하지 않습니다.
3. HWPX 생성/분할/병합을 XML provenance·현재 paragraph/run/site 및 ZIP 저장에 연결.
4. Canvas 문단 간 선택/caret·추가 브라우저/OS IME 검증. 일반 문단의 경계 Backspace/Delete 병합은 연결됐습니다.
5. 반복 분할 비용 개선: plan의 생성 ID 충돌과 다음 동일 owner 검색은 현재 반복 순회입니다. 파생 인덱스 최적화와 대규모 실측이 필요하며 작은 fixture 통과를 성능 보장으로 읽지 않습니다.
6. 전체 native·현재 문서 해시 검증, 모든 관련 corpus와 브라우저/OS IME, 실제 조판.

원본의 개체·필드·표·조판을 삭제하는 축소 구현이나 신규 문단의 위조 원본 바인딩은 전체 목표의 대체가 아닙니다.

### 공개 병합 API 후속 실측

현재 병합 native 변경을 포함한 전체 `zig build test -Doptimize=ReleaseSafe --summary all`은 2,820/2,820 테스트·7/7 단계·종료 코드 0으로 완료됐습니다(root 2,811·별도 9). root 실행 약 10분·최대 RSS 34 GiB이며 runner의 `failed command` 표기는 최종 성공 요약·종료 코드와 구분했습니다. 마지막 빈 텍스트 oracle 수정 후 제품 감사 101/101·7/7 단계 및 병합 corpus 재실행 566/1,434·검증 실패 0건도 확인했습니다. JS 문법·Zig 포맷·diff 검사 통과입니다. 이는 현재 지원 거래의 회귀 근거이며 전체 파서/편집/UI/조판 목표 완료를 뜻하지 않습니다.

빈 PARA_TEXT 반례에서 merge oracle의 정규화 누락을 재현해 수정했습니다. 오른쪽 생성 빈 문단의 payload를 0바이트로 하고 헤더 문자 수도 0으로 맞춘 입력에서 native 병합은 끝 PARA_BREAK를 유지하지만 기존 oracle은 빈 payload를 그대로 사용해 2바이트가 부족한 예상값을 만들었습니다. 기존 독립 text oracle과 같이 부재/0바이트·선언 1 이하만 빈 끝 표식으로 계산하도록 수정했고 최신 structure-editor 10/10이 통과했습니다. 선언 1·실제 0바이트라는 불일치 입력은 native open의 ParagraphTextCountMismatch로 거부됐으며 그 손상을 허용하도록 제품을 바꾸지 않았습니다. 제품 오류와 oracle 오류를 구분한 실측입니다.

Canvas의 구조 대기 상태는 분할 전용 splitTarget 대신 명령 kind와 이동 target을 함께 가진 structureTarget으로 통합했습니다. 병합 대기 중 분할 응답을 주입해도 readOnly·pending이 유지되고 실제 병합 응답만 거래를 해제하는 회귀를 검사했습니다. 표시 한도 오류 메시지도 실제 분할/병합 종류를 반영합니다. 최신 Canvas/Worker/공개 structure 결합 검사는 40/40 통과입니다. 이는 종류 불일치 응답 방어이며 같은 종류의 오래된 응답을 구분하는 요청 ID 프로토콜 검증을 뜻하지 않습니다.

독립 merge oracle 자체의 반례도 추가했습니다. 정상 charshape 병합 저장본에 CFB writer로 텍스트 한 바이트·글자 run style ID·owner 마지막 문단 MSB·비대상 DocInfo 한 바이트를 각각 변조해 별도 파일 바이트를 생성했고 모든 변조를 oracle이 AssertionError로 거부했습니다. 제품 writer는 반례 파일 포장에만 쓰며 기대값은 여전히 독립 CFB.js/레코드 해석에서 산출합니다. 정상 병합본 통과도 먼저 확인했습니다. 최신 공개 structure-editor 검사는 9/9 통과입니다.

최신 반복 편집·거부 후 입력 회귀를 포함한 `zig build hwp5-editor-audit hwpx-text-audit -Doptimize=ReleaseSafe --summary all`은 HWP5 99/99 및 HWPX 감사 모두 성공, 전체 9/9 단계가 통과했습니다. 공유 Canvas 변경에 대한 HWPX 공개 편집/Worker 회귀도 포함합니다. 인라인 링크 검사에서는 593개 Markdown·3,070개 링크의 누락이 0건이었습니다. 전체 native test와 문서 해시 manifest 완료 상태는 이 결과와 별개입니다.

반복 생성 문단 회귀는 charshape의 동일 문단에서 시작·끝·중간을 순환하는 12회 split→merge를 수행합니다. 각 split 저장본은 이전 저장본 기준 독립 split oracle, 각 merge 저장본은 split 저장본 기준 독립 merge oracle로 전체 Section/스트림을 대조하고 raw text·문단 개수·undo 분할본 전체 바이트·redo 병합본 전체 바이트를 검사합니다. 해당 회귀 추가 후 공개 structure-editor 검사는 8/8로 통과했습니다. 특정 일반 문단의 반복 검증이며 모든 중첩 owner·보호 컨트롤·임의 구조 편집을 검증했다는 뜻은 아닙니다.

추가 모드 검증에서 native paragraph merge 집중 검사는 Debug·ReleaseFast 각각 root 포함 4/4가 통과했습니다. 제품 hwp5-editor-audit ReleaseSafe는 97/97·7/7 단계가 통과했고 이후 Canvas cross-cell refusal 회귀를 추가한 개별 Canvas 검사는 26/26이 통과했습니다. 해당 회귀는 software 제목에서 오른쪽 다른 셀로의 Delete 병합 거부 후 제목·caret·원본 저장값·입력 가능 상태와 후속 텍스트 입력을 확인합니다. `zig fmt --check build.zig src`도 통과했습니다. 전체 ReleaseSafe native test는 시작했으나 이 기록 시점에는 실행 중으로 완료 수치를 주장하지 않습니다.

실제 외부 접속 Chromium에서도 software.hwp의 `2025 Software Wave DSM 공모 참가신청서` 제목을 pointer로 선택하고 ArrowRight→Enter→Backspace로 분할/병합했습니다. caret `0:3:0`→`0:2:1`과 제목 복원을 확인했습니다. 병합본 `/private/tmp/hwpjs-canvas-merge-e2e.hwp`, undo로 되돌린 분할본 `/private/tmp/hwpjs-canvas-before-merge-e2e.hwp`를 UI로 다운로드해 독립 전체 레코드 merge oracle을 통과했고 redo 다운로드 `/private/tmp/hwpjs-canvas-merge-redo-e2e.hwp`는 최초 병합본과 전체 바이트가 일치했습니다. agent-browser 스킬의 실제 pointer/키 입력·UI 다운로드로 검사한 결과이며 OS 한국어 IME·한글 프로그램의 조판 동치까지 증명하지 않습니다.

선택적 WASM export `hwp5_edit_merge`와 JS `mergeParagraph({ section, paragraph })`를 연결했습니다. 인접 오른쪽 문단을 왼쪽에 병합하며 기존 native 거래·이력을 재사용합니다. `tests/hwp5/style-preservation/merge-record-oracle.mjs`는 독립 CFB/레코드 해석으로 양쪽 단위별 글자 서식·전체 Section·목록 count·owner별 마지막 표식·비대상 스트림을 대조합니다.

제품 ReleaseSafe 빌드 5/5 후 `node --test tests/hwp5/structure-editor.test.mjs`가 7/7로 통과했습니다. 실제 charshape 원본 쌍과 software/table의 저장 후 재열린 같은 셀 쌍에서 병합·저장·재열기 및 undo/redo 전체 바이트를 확인했습니다. 편집을 무시한 출력은 독립 oracle이 거부합니다. 서로 다른 셀 병합 거부, 잘못된 숫자/마지막 문단 거부 뒤 redo 유지, 선택적 export 없는 WASM의 명시적 오류·기존 분할 유지, close 이후 거부도 검사했습니다. 이 후속 실측은 위 과거 단계의 미연결 상태를 갱신하지만 전체 corpus·현재 전체 native·Canvas 병합·OS IME·조판 완료 증거는 아닙니다. 현재 문서 검증 manifest 갱신도 아직 남았습니다.

Worker의 `merge`는 native 병합이 적용된 직후 applied 상태를 기록하고 저장본을 native reader로 다시 읽어 전체 파생 문단 projection을 갱신합니다. enable 응답의 `mergeAvailable`은 실제 선택적 export 존재로 판정하며 split 지원 여부와 독립적입니다. Canvas는 선택 영역 없는 문단 시작 Backspace/끝 Delete 및 해당 beforeinput을 병합 명령으로 전달합니다. 중복/초안/조합 중 거래를 막고 성공 후 왼쪽 기존 끝 위치로 커서를 이동합니다. 논리 owner 최종 판정은 native가 소유하며 JS가 같은 셀이라고 추측하지 않습니다.

`node --test tests/hwp5/canvas-editor.test.mjs tests/hwp5/reader-worker.test.mjs tests/hwp5/structure-editor.test.mjs` 37/37이 통과했습니다. 새 검사는 실제 native split→Backspace merge 및 Delete beforeinput, 병합 지점 caret, 중복 요청 억제, 선택 텍스트 비병합과 실제 Worker 병합 undo/redo 전체 projection 복원을 포함합니다. DOM harness 결과이며 실제 브라우저 키 입력·다운로드·OS IME 검증과 전체 corpus 검증을 대체하지 않습니다.

추적 HWP 48개의 모든 인접 문단 쌍은 `node tools/hwp5-merge-corpus-audit.mjs`로 조사했습니다. 1,434회 시도 중 566회는 독립 전체 Section/비대상 스트림·저장 후 재열기 모든 구역/문단 raw text·undo 원본 전체 바이트·redo 편집 전체 바이트가 일치했습니다. 거부는 UnsupportedStructuralControl 102, ParagraphOwnerMismatch 583, UnsupportedSectionControl 174, UnsupportedCrossParagraphField 1, UnsupportedTextControl 8이며 각 거부 후 원본 및 기존 redo 값을 검사했습니다. 열기 거부는 배포용 2개·암호화 1개로 별도 집계했고 검증 실패는 0건입니다. 같은 현재 제품으로 native paragraph merge ReleaseSafe 집중 검사도 root 포함 4/4 재확인했습니다. 이 corpus는 원본 인접 쌍 범위이며 임의 반복 구조 편집·모든 보호 컨트롤·HWPX 구조 편집·실제 브라우저·조판 동치의 증거가 아닙니다.
