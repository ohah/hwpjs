# HWP5 수식 스크립트 optional ABI와 Native 보관 lease

## 후보와 증거 경계

기준 main은 `8be6ad5731af39a15b4aa5e16d276f9badde9f26`이다. Native 본체는 [스크립트 편집](hwp5-equation-script-edit.md)의 exact `c970a869` 패킷에서 가져왔다. 기존 named5 통과와 마지막 fixture 수정 named1 통과는 서로 다른 cohort로 보존하며, 이 ABI 후보의 Native/WASM 통과로 재분류하지 않는다. 이번 후속은 소스 구현과 가벼운 JS·타입·생성 검사만 수행한다.

## 선택 export 세 개

| 이름 | 인자 | 결과 |
| --- | --- | --- |
| hwp5_edit_equation_script_edit_version | 없음 | i32 profile1 |
| hwp5_edit_equation_script_edit_capture | i32 section, i32 equation_node, i32 layout | i32 성공1/거부0, 기존 output 버퍼 |
| hwp5_edit_equation_script_edit_commit | i32 JSON pointer, i32 bytes | i32 거부0/적용1/no-op2/불명3 |

기존 required ABI, HWPX, read/create export 이름·서명과 ABI version은 유지한다. SSOT는 js/abi-schema.mjs이며 tools/generate-abi.mjs로 Zig optional signature 목록을 생성한다. 새 optional export가 없거나 profile이1이 아닌 구형 엔진에서는 사용하지 않는다. 선택 export 존재는 제품 모듈 qualification이나 Core/UI의 편집 권한이 아니다.

layout은0 version-only,1 with-font를 명시한다. 알 수 없는 layout은 거부하며 버전·길이로 배치를 추측하지 않는다. selector는 현재 실제 EQEDIT 물리 node이며, 표시 ordinal이나 CTRL_HEADER node가 아니다.

## Native 보관과 한 번 소비

각 WASM instance는 equation_script_leases 저장소 하나를 가진다. 저장값은 기존 Native Witness 전체와 세션 포인터·view epoch u64·History revision이다. 기존 Witness의 full ticket/물리 Site/section·payload·CTRL_HEADER·tail hashes는 Native 내부에만 남는다. JS·Worker·공개 DTO에 직렬화하지 않는다.

capture export 첫 동작은 clear다. layout/selector/History/닫힌 세션 검사나 할당에서 조기 실패해도 이전 lease는 복원되지 않는다. close도 clear하며, serial은 close에서0으로 되돌리지 않는다. u64 serial overflow는 새 발급을 거부하고 저장값은 비운다. 성공 시 발급하는 lease는 손실 없이 처리하는 canonical decimal string이다.

commit은 JSON 파싱, 크기 검사, 세션·write guard보다 먼저 take한다. 잘못된 JSON/lease, stale, no-op, 정상 적용, Native 불명 상태 모두 이전 lease를 다시 쓸 수 없다. retained frame의 세션·revision·view epoch와 현재 full ticket을 확인한 뒤 기존 edit_equation_script를 적용한다. 기존 Native 본체가 실제 owner/hash/보호와 prospective save/reopen을 다시 검사한다. noop도 같은 검사를 거친 뒤 기존 revision 불변으로2를 반환한다. 명시 stale-layout 저장 정책은 그대로 유지한다.

## wire schema1

capture reply의 정확한 필드는 schemaVersion, scope, executionAuthority, lease, section, equationNode, layout, historyRevision, scriptUtf16LE, limits다. scope는 hwp5-equation-script-edit-capture이며 executionAuthority는 false다. scriptUtf16LE는 원시 u16 배열이고 layout 문자열은 version-only 또는 with-font다. limits는 scriptUnits65535/scriptBytes262140/requestBytes1048576/replyBytes2097152다. 추가 Native witness·hash·ticket·session·view epoch는 전달하지 않는다.

commit 입력은 정확히 `{schemaVersion:1,lease:string,script:string}`이다. unknown field, 중복 key, 다른 schema, 비정규 decimal과 u64 overflow, 잘못된 UTF-8/UTF-16 길이·예산은 거부한다. script는 생성기의 기존 비어 있지 않은 정책을 재사용하고 UTF-16 code units65535까지다. caller의 hash/ticket/보호 flag/임의 Native observation은 받지 않는다.

## JS와 typed Core/UI 인계

JS facade는 supportsHwp5EquationScriptEditAbi, captureHwp5EquationScript(section,equationNode,layout), isHwp5EquationScriptCurrent, editHwp5EquationScript(capture,script)를 제공한다. public frozen capture에는 section/equationNode/layout/script/historyRevision만 있으며 lease id도 WeakMap private다. 같은 WASM에 새 capture가 생기면 이전 JS capture도 무효다. JS 인자 오류나 잘못된 Native reply로 새 capture가 실패할 때는 invalid-layout capture를 한 번 호출해 Native 이전 lease를 비운다. 이 경로는 owner 조회 전에 거부되며 편집·재시도 호출이 아니다.

원문 UTF-16은 BOM과 astral pair를 유지하며 unpaired surrogate를 자동 복구하지 않는다. facade는 잘못된 원문 UTF-16의 편집 capture를 거부하고 Native lease도 폐기한다. Native 원문 읽기 API의 raw 단위 보존은 바꾸지 않는다. 새 입력이 사전 검사에서 잘못된 경우에는 아직 apply를 시도하지 않았으므로 draft를 수정할 수 있다. Native 호출 시도 직전에 JS capture를 소비하고, primitive code/unknown/trap/cleanup 실패 뒤 재시도하지 않는다. no-op을 JS에서 가로채지 않고 Native로 보낸다.

isCurrent는 O(1) private active/closed/history revision 사전 검사다. Native session/view epoch의 권한 증명이 아니며 undo/redo로 revision이 돌아온 경우에도 Native retained frame이 commit에서 최종 거부한다. Core/UI는 정확한 EditorState/token과 현재 선택 owner를 별도로 유지해야 한다. dialog 취소/Worker reset에는 non-ABI discardHwp5EquationScript(capture)를 사용한다. 현재 private capture만 폐기하고 invalid-layout capture로 Native 저장소를 clear하며, 다른/소비된 capture는 새 lease를 건드리지 않는다. 반환 true는 local 폐기를 뜻하며 mutation 성공이 아니다. Noether에 opaque Worker leaseKey+token/선택 contract를 전달했으며 이 패킷은 Core/UI 소스를 수정하지 않는다. 공개 패키지 선언/빌드와 실제 Worker 연결은 후속 gate다.

## inventory와 표시 비용

web/preview/hwp5-equation-content.mjs와 equation_sources의 기존 조회 경로를 유지한다. renderer는 구역당 equationSnapshot 한 번, paragraph Map과 grouped source를 사용한다. paragraph.equations[].node는 site.equationNode 그대로다. 새 owner capture는 명시 선택/열기에서만 호출한다. 목록 줄마다 canEdit/capture를 호출하지 않고, JS isCurrent는 owner scan이나 Native capture를 호출하지 않는다. lease 검사를 위해 inventory를 재구축하지 않는다.

## 준비한 검사와 실행 계획

JS controlled facade 검사34개는 private capture·새 capture/close·invalid reply·큰 decimal·raw UTF-16·stale revision/view/session·noop/거부/불명·cleanup/할당 실패의 재시도 금지를 확인한다. 이는 실제 WASM export/Native의 증거가 아니다. 별도 공개 타입 noEmit과 공식 generated schema check를 수행한다.

Native issuer/wire 명부는 H5 equation script lease7개+registration1이다. clear/take/serial overflow, session/revision/view/full ticket, wire에서 Native witness 부재, strict JSON/decimal, script units exact+1을 준비했다. 아직 컴파일·실행하지 않았다. 이 명부는 allocator가 wasm_allocator인 실제 hwp5_edit export 본체를 Native로 실행하지 않으며 실제 wrapper 검증에는 공식 WASM이 필요하다.

후속 순서는 승인된 전용 source/compiler/cache/resource pin의 focused Native7, 별도 승인 official ReleaseSmall, compiled optional3 signature와 기존 전체 signatures 비교, 일반 SDK declaration/import·실제 apply/noop/stale/close/new capture/save/reopen 검사, Worker/Core/UI와 독립 raw oracle·GUI다. 재시도와 full Native suite는 자동으로 시작하지 않는다.
