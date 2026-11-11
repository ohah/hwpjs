# HWP5 원본 셀 나누기

`src/hwp5/edit/source_table_cell_split_service.zig`는 현재 관리 이력과 원본 셀 binding으로 검증하는 Native typed 경계다. `Service.capture`는 기존 Session의 `tableBindings`에서 실제 셀을 읽고 `Target`을 반환한다. `Service.apply`는 이 target과 줄·칸 개수를 받아 기존 `History.apply`에 `.split_source_table_cell` 명령 하나를 전달한다.

## 지원과 정책

현재 공개 범위는 최상위 본문의 원본 정적 표에서 물리 셀 하나를 나누는 것이다. 선택 셀과 주변 셀의 병합을 허용하며 선택 셀의 전체 span과 모든 소유 문단을 검증한다. 줄·칸은 1~63이며 유지 방향은 1, 활성 방향은 2~63이다. 총 논리 격자는 4096 이하로 제한한다. 여러 셀 각각 나누기와 합친 후 나누기, 불균등 높이 유지 옵션은 후속 범위다. 분할 결과의 주변 span은 보존하며, 지원 조건을 만족하면 다시 나눌 수 있다.

원본 표 크기는 고정하고 선택 셀의 크기를 양수 정수 단위로 나눈다. 나머지는 앞쪽 조각에 하나씩 배분하는 후보 정책이다. 원래 문단 전체·글자 모양·문단 모양·style·instance ID는 첫 조각에 남기고, 나머지 조각은 첫 문단/첫 run 서식을 물려받은 빈 문단 하나를 가진다. 새 ID는 기존 파일 어댑터가 DocInfo와 모든 구역의 ID를 색인해 발급한다. 비선택 셀은 폭·높이·본문·서식을 유지하고 분할로 생긴 축을 가로지르는 span만 조정한다.

공식 HWP5 revision1.2의 표75/79/80을 레코드 구조 근거로 사용한다. 셀 본문과 속성 승계는 공식 셀 나누기 도움말을 따른다. 정수 나머지 배분은 위 후보 정책으로 명시한다. [HWP5 공식 명세](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.2.pdf), [공식 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/table/table%28divide%29.htm)

공식 spec6과 기존 observed8 원시 writer 경로를 검증한다. Session typed 경계는 기존 `tableBindings`의 observed8 정책을 명시적으로 사용한다. 길이나 버전으로 둘 중 하나를 추측하지 않는다. 보호 셀 판정은 기존 `CellAttributes`를 재사용한다. 보호 bit의 해석을 새 공식 명세 사실로 분류하지 않는다.

## 소유권과 원자성

Target은 현재 Session의 History mutation ticket, revision, 기존 `formatting_binding.State`의 session epoch 및 실제 section/table/list/행·열에 묶인다. 닫힘, 재열기 세대, foreign History, unmanaged protocol, poison, 진행 중 mutation, 외부 변경과 undo ABA를 거절한다. 요청 필드는 apply에서 다시 현재 Native binding과 대조한다. 이력과 lifetime은 호스트가 소유하며 lifetime을 성공적인 open/reopen마다 증가시켜야 한다.

새 Session 명령은 선택 구역에 기존 strict `source_policy.validate`, 다른 모든 구역에 `validateUnselectedStructureSection`을 적용한다. 선택 구역의 미지원 필드·제어를 거절한다. 원본 grid writer의 표 전체 보호·중첩·caption·cache·opaque child·확장·zone 거절도 재사용한다. 보류 생성 표와 cell background/resource remap 제한은 기존 Session 경로가 소유한다. private 원시 writer가 보존하는 비대상 opaque 레코드라도 typed service의 구역 정책에서 거절될 수 있다.

기존 불변 파일 준비, 현재 Section 재투영과 rebased source 교체 경로를 사용한다. 새 CFB나 임시 arena를 이력에 저장하는 별도 스택을 만들지 않는다. 새 문단·버퍼는 Session allocator가 소유하며 요청 반환 후 빌린 입력을 보관하지 않는다. 보호·예산 실패와 OOM은 기존 managed checkpoint rollback을 사용한다.

`source_table_grid`의 기존 command 입력은 optional로 확장되며 새 split 입력과 정확히 하나를 요구한다. 기존 네 grid 명령은 기존 공통 mapping을 사용한다. `source_table_grid_operation.zig`는 H5 전용 geometry 분기만 소유한다.

## 검증과 남은 연결

실행·해시·원본/결과 CFB와 독립 오라클은 `zig-out/verification/hwp5-source-cell-split-r1/ADOPTION-MANIFEST.json`에 고정한다. 생성 constructor로 파일을 저장한 뒤 새 Session으로 열어 원본 표로 편집한다. 비압축·압축, style/run 승계, 단일 revision, 저장 재열기·undo/redo, stale/foreign/닫힘, 보호·중첩·unknown, OOM 및 후반 예산 거절을 집중 검증한다. 외부 보호 fixture는 사용하지 않는다.

독립 Python 오라클은 프로젝트 CFB/record parser를 import하지 않고 MS-CFB와 공식 HWP5 framing을 직접 읽는다. 비대상 스트림과 메타데이터, 실제 셀 주소/span/크기, 원본 문단 원시 바이트와 신규 빈 문단·ID·run 승계를 검사한다. [MS-CFB 공식 문서](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/53989ce4-7b05-4f8d-829b-d08d6148375b)

초기 Native 후보에서 공개 WASM·SDK·Core·Surface 연결을 확장한 이력은 아래 R2/R6 절에 있다. 실제 외부 문서 전체나 OS 입력 호환을 합성 입력 검증으로 보증하지 않는다.

writer는 입력 record·문단을 검증하고 출력 논리 격자 `L=(R+a-1)(C+b-1)`를 순회한다. live 경로는 기존 tableBindings와 저장·재개방·checkpoint 비용을 포함한다. 기존 cell-size intent와 binding 대조의 반복 비용까지 포함한 전체 서비스 선형성을 이 집중 검증으로 주장하지 않는다.

## R2 공용 split 연결 이력

R2는 기존 `SPLIT_SOURCE_TABLE_CELLS_COMMAND`, opaque Surface 선택 증명과 소유 메뉴 등록, 같은 대화상자를 형식 어댑터로 재사용한다. `HeadlessEditor.getSourceTableCellSplitCapabilities()`와 SDK의 `sourceTableCellSplitCapabilities()`는 현재 binding 및 지원 profile을 반환한다. HWP5 profile은 `single-unmerged-source-cell`이며 `maxSelectedCells=1`, 병합 입력·합친 후 나누기·원본 불균등 높이 유지 지원은 false다. HWPX는 기존 직사각형 profile을 유지한다.

선택 증명은 현재 Native source binding의 모든 문단·격자·span 대조를 공유한다. HWP5는 표 전체가 비병합이고 선택 물리 셀이 하나일 때만 target을 발급한다. Core는 FIFO/IME 정리 후 상태·lease를 재검사하고 Native capability의 revision·format 및 선택 제한을 확인한다. SDK의 scope 비교와 Native의 open epoch/revision/non-rewinding serial 검사를 거친다.

Native optional export는 `hwp5_edit_source_table_cell_split_capabilities`와 `hwp5_edit_split_source_table_cells`다. 공용 scalar split 요청을 받아 HWP5가 지원하는 단일 셀·each·균등 분할 intent만 허용한다. 기존 formatting lifetime과 managed History를 사용하고 mutation 전에 view epoch를 예약한다. 기존 0/1/2/3 완료 처리와 postcommit refresh 경로를 재사용한다.

HWP5 대화상자는 지원 범위를 표시하고 합친 후 나누기와 높이 유지 옵션을 비활성화한다. 다중 선택은 메뉴 사유와 함께 거절한다. 후속 목표는 병합 입력, 여러 셀의 개별 분할, 합친 후 분할, 불균등 높이 유지다. 현재 profile의 제한은 전체 셀 나누기 목표에 남는 작업이다.

R2의 실제 WASM·Core/SDK·Vanilla Worker 메뉴·CFB 저장/undo/redo/재열기 및 Main params+bullet 회귀는 `zig-out/verification/hwp5-source-cell-split-r2/ADOPTION-MANIFEST.json`에 고정한다. 공개 배포와 최신 Main 진행분의 최종 합본은 별도 인수 단계다.

새 글머리표 정의 writer/query·HWP5 크기 권한·COW·parked history를 보존한 F 기준 R2 결합 및 직접 재검증은 [결합 후보 인수](hwp5-cell-split-integration.md)에 기록한다. frozen 단일 원본 셀 범위를 유지하며 Main의 채택·배포는 별도 게이트다.

## H 기준 Native 병합·extent 준비 closure (R5)

Main `cce7ead1fc1ca17b73bebd01ea3d72945272e1da`의 H 소스를 현재값으로 두고 동결 R2를 공통 조상, R3/R4의 Native 파일만 incoming으로 병합한 격리 후보가 있다. 인수 원장은 `zig-out/verification/hwp5-source-cell-split-r5-native-rebase/ADOPTION-MANIFEST.json`이다. 위 R2의 공개 범위와 Main 통합 기록은 그대로 남긴다. 이 closure는 UI 확대 또는 새 공개 capability 선언이 아니다.

원본 split 전용 writer는 병합 span의 완전 격자와 실제 셀 크기 등식을 검증하고 비선택 셀의 물리 크기/원문·서식을 보존한다. 외곽 control 선언은 실제 셀 합과 달라도 원시 바이트로 유지하며 양수 절대 크기와 기존 SSOT 크기 잠금·보호·spacing·unknown·복합 셀 거절을 지킨다. 기존 행·열 grid writer의 합==외곽 정책은 별도로 유지한다. `source_table_grid`는 split에만 새 writer를 위임하고 기존 셀·문단 SSOT를 공유한다.

H의 WASM은 기존 `Service.capture()`가 단일 비병합 셀을 거절/허용한다고 전제한다. 공개 ABI·capability·JS decoder·Core/Surface witness를 함께 바꾸지 않은 상태에서 이 함수만 넓히면 1×1 요청으로 병합 셀을 가리킬 수 있다. 따라서 `capture()`는 선택 셀 span1과 기존 writer의 표 전체 비병합 공개 제한을 함께 확인한다. 비선택 병합 때문에 apply에서 거절하던 공개 입력도 이제 캡처에서 미리 거절하며 실제 적용 범위는 넓히지 않는다. Native 전용 `captureWithSpans()`가 같은 source binding/ticket/revision issuer를 공유해 병합 셀을 명시적으로 캡처하고 apply는 실제 현재 span까지 재검사한다. 기존 R2 호출과 H의 공개 좁은 profile은 유지되고, 새 merged public profile/완전 span witness 연결은 후속 통합이다.

이 단계는 H497 optional ABI, WASM delegate, JS/Core/UI/Bridge/기존 profile 파일을 변경하지 않는다. 공개 경로에서는 비병합 셀의 extent mismatch 수정이 적용되며, 병합 셀 지원은 Native typed opt-in으로만 준비한다. 다중셀·merge-then-split·높이 유지·pending-created/중첩/필드/컨트롤/캐시/캡션/zone 등 복합 셀은 여전히 후속 범위다. 단일 History·stale/foreign/protocol/보호 및 이전 redo 보존은 기존 managed 경계를 사용한다.

집중 검사는 새 rebase probe에서 Native managed geometry/extent/호환 거절과 기존 split/grid를 선택 실행한다. 실제 Native WASM 재빌드는 Main 최종 합본 한 번으로 남기며 이전 R4의 실제 SDK/Core/브라우저 증거를 이 H 결합 바이너리의 실측으로 바꾸어 부르지 않는다. 새 Native 검증과 비용의 범위·해시·전후파일은 인수 원장을 따른다. Root/Git/npm/다른 agent의 J 소스·공용 cache는 수정하거나 삭제하지 않는다.

## R6 병합 원본 단일 셀의 공개 연결

현재 J의 H5 bullet common Native intent·CLI·R5 closure 위에 공개 연결 hunk만 추가한 별도 후보다. 기존 Native-only 준비를 공개 완료로 간주하지 않고 실제 optional WASM/JS SDK/typed Core/runtime/Surface 메뉴와 세 프레임워크에서 검증했다. 인수 manifest는 `zig-out/verification/hwp5-merged-cell-split-r6/ADOPTION-MANIFEST.json`이다. 앞선 R5의 공개 비병합 제한 설명은 그 동결 단계의 기록이며 R6에서는 아래 구분으로 확장한다.

WASM의 기존 scalar split export/arity는 유지한다. 신형 capability는 schemaVersion1, format hwp5, sourceProfile `single-source-cell-with-spans`, supportsMergedInput=true, maxSelectedCells1이다. 구형의 `single-unmerged-source-cell`/false와 HWPX의 `static-source-cell-rectangle`을 별도 엄격 DTO로 디코드한다. flags/format/profile을 혼합하거나 unknown profile을 넣으면 거절한다. 새 JS/Core는 구형 엔진도 지원하지만 Native/SDK 변경은 함께 채택해야 한다.

Native apply는 기존 issuer인 `captureWithSpans()`로 현재 source 셀을 캡처한다. 요청 top/left가 실제 source owner를 가리키고 expectedRows/Columns 및 bottom-top/right-left가 현재 셀의 rowSpan/columnSpan 전체와 같아야 한다. 기존 epoch/revision/non-rewinding serial·managed History·protection/source 정책·viewEpoch 사전 예약·0/1/2/3 완료 처리는 유지한다. 부분/확대 사각형으로 병합 셀을 가리키는 요청을 거절한다. Service의 legacy capture는 그대로 남고 새 issuer/state/history를 만들지 않는다.

capability Native 조회는 currentRevision/check/historyTicket/기존 lifetime과 응답 버퍼만 사용한다. source paragraph/context 조회·편집 명령·새 persistent 모델 생성은 하지 않는다. SDK profile은 실제 Native DTO에서 읽으며 history 전에 초기 readonly projection이 이 질의를 호출하지 않게 구분한다. 관리되지 않은/readonly 상태는 capability 질의로 활성화되지 않는다. history 활성 상태에서 질의를 반복해도 저장/바인딩/history stats가 같다.

Core는 기존 완전 셀 블록 validator에서 immutable 현재 Native projection의 row/column/span과 모든 문단 소유권으로 전체 사각형을 계산한다. weak target/Surface lease/state snapshot/FIFO·IME settlement 검사와 Native 직전 fresh capability·binding을 재사용한다. Native format/profile/revision이 현재 content와 맞아야 한다. stale/foreign/reopen·부분 문단/틀린 anchor를 거절한다. Core는 profile이 신형일 때만 HWP5 단일 병합 셀을 허용하며 구형 엔진의 표 전체 비병합 admission은 유지한다.

기존 Surface 소유 컨텍스트/표 메뉴·모달을 사용한다. 도움말은 실제 runtime profile에 따라 병합 지원 여부를 구분하고 여러 셀·합친 후 나누기·높이 유지 옵션은 계속 거절/비활성화한다. Native 범위는 여전히 최상위 BODY의 허용된 원본 정적/plain 표다. 필드/컨트롤/중첩/보호/cache/opaque/zone/pending-created 지원을 새로 선언하지 않는다. unsupported에서 평문 치환 fallback을 하지 않는다.

J499 exports/arity와 H5 bullet API는 보존한다. Native 파일은 기존 split capability/apply 두 함수 이외 바이트가 동일하고 다른 제품 소스는 인수 manifest의 정확한 hunk만 변경한다. R5 geometry/extent 및 행·열 정책은 그대로다. 실제 SDK/Core19+적대적6, 기존 HWPX47, Vanilla/React/Svelte의 실제 merged source 업로드·F5·메뉴·모달·다운로드 CFB·undo/redo/재열기와 취소/다중셀 거절은 별도 로그에 고정한다. CFB oracle은 normal/-O에서3배치와 metadata/outer 변조2종을 검사한다. stale-layout 허용 저장을 명시적으로 사용했으며 한글 재조판·모든 실제 문서나 OS IME·completion2/3 fault injection 완료를 의미하지 않는다.

## 현재 정규 검증 경로

`tests/hwp5/source-table-merged-cell-split.test.mjs`는 현재 Native로 다시 생성한 full/vertical/horizontal/unselected-span/offset 입력 5개와 SHA를 사용한다. SDK와 Core의 전체 span·문단 소유권, 단일 이력, 부분/foreign/undo ABA 거절, 구형 비병합 엔진의 제한을 검사한다. 독립 CFB·레코드 검사는 일반 Python과 `-O`에서 원본 보존·격자·크기·본문/서식/ID를 대조하며 무변경 파일과 틀린 형태를 거절한다. 정규 원래 셀 나누기 10건도 확장된 profile과 다시 선택 가능한 분할 결과를 검사한다. 실제 Vanilla/React/Svelte의 F5·메뉴·모달·저장·이력·재열기는 별도의 공개 번들 GUI 검증이다.


## CLI/MCP 원본 병합 셀 한 개 나누기

현재 GitHub 구현 기준이며 npm 게시 버전의 지원 선언이 아닙니다. 단일 `npm install @ohah/hwpjs` 빌드의 기존 `hwpjs apply` / `apply_document_changes`에서 `source-table-cell-split` 연산을 사용합니다. optional Native capability의 `supportsMergedInput === true`일 때 HWP5의 full-span 단일 물리 셀을 허용합니다. false인 기존 엔진은 표 전체 비병합 제한을 그대로 유지합니다. Native/SDK profile을 임의로 확대하거나 자동 fallback하지 않습니다.

`reference`는 같은 원본 SHA로 read 구조 보기에서 읽은 table reference입니다. expectedRows/expectedColumns는 현재 격자 전체 행열, top/left/bottom/right는 선택 물리 셀의 전체 span 사각형(bottom/right 제외 경계)이어야 합니다. rows/columns는 분할 개수입니다. HWP5는 selected physical cell 정확히1, mode=each, equalizeRows=true만 지원합니다. 일부 span·여러 물리 셀·merge-then-split·기존 높이 보존은 거절합니다. 지원 capability가 true이면 선택하지 않은 다른 병합 셀도 보존할 수 있습니다.

예를 들어 실제2×2 격자 전체를 한 물리 셀이 차지한다면 top0/left0/bottom2/right2로2×2 나누기를 요청합니다. 새 필드나 숫자 Native tableNode/binding을 입력에 추가하지 않습니다. 기존 resolveTableReference·expected grid·현재 owner·fingerprint·session/revision/serial·단일 사용 ticket을 그대로 검사합니다. 앞선 변경으로 Native binding이 달라지면 예전 reference 숫자를 다른 표로 재해석하지 않습니다. 후행 오류에는 새 출력 파일을 게시하지 않고 원본·기존 출력도 덮어쓰지 않습니다.

```json
{"kind":"source-table-cell-split","coordinates":"current-transaction","reference":"EXACT_TABLE_REFERENCE_FROM_READ","expectedRows":2,"expectedColumns":2,"top":0,"left":0,"bottom":2,"right":2,"rows":2,"columns":2,"mode":"each","equalizeRows":true}
```

CLI는 위 연산을 배열로 `--operations`에 전달하거나 `{"version":1,"operations":[...]}` patch 파일로 지정합니다. `hwpjs apply ./document.hwp --patch ./split-patch.json --expect-sha256 EXACT_INPUT_SHA256 --output ./split.hwp --allow-stale-layout --wasm /absolute/current-engine.wasm`입니다. MCP는 `hwpjs mcp --wasm /absolute/current-engine.wasm`에서 같은 연산을 `apply_document_changes`의 operations 배열에 넣습니다.
