# HWP5 literal editor의 optional lease·ABI successor

이 문서는 frozen Native5d0a88f9에서 시작한 optional lease와 ABI의 wire 계약을 소유한다. 현재 제품 지원 범위, 입력 한도와 exact176a의 실제 SDK/Worker/GUI 검증 결과는 [차트 데이터 편집 계약](hwp5-chart-literal-edit.md)이 소유한다. 아래 초기 probe 준비 기록을 이후 실제 실행 결과와 합쳐 세지 않는다.


## 원형 리터럴 소스 후보

capability version4는 `spec24_standard_pie_literals_v1`과 기존 세 프로필을 명시 허용한다. version3에서 기존 세로·꺾은선·가로 동작을 유지하며 원형은 거부한다. 선택 export 네 함수의 이름·매개변수·결과와 wire schemaVersion1은 유지한다. Native의 전체 witness 검증과 private JS capture 권한은 동일하다. 공개 capture에 전달하는 선택 `profile`은 Native lease에서 복사한 읽기 전용 관측이며 편집 권한을 대체하지 않는다. 이 항목은 소스 준비 계약으로 실제 컴파일·WASM 검증 완료를 뜻하지 않는다.

## 가로 리터럴 소스 후속

version3에 `spec24_clustered_horizontal_bar_literals_v1`을 추가한다. version1은 기존 세로, version2는 기존 세로와 꺾은선, version3은 세 프로필을 명시적으로 허용한다. 미지 버전과 프로필은 거부하며 함수를 추가하거나 wire schemaVersion1을 바꾸지 않는다. 기존 version1/2 SDK를 version3 엔진과 조합해 활성화한다고 주장하지 않는다. 아래 version2 설명은 기존 실행 이력이다. 신규 Native/WASM/SDK/GUI 검증 완료를 뜻하지 않는다.

## 선택 export와 원본 SSOT

ABI 버전6과 기존 required/HWPX/차트 read/create export 및 signature는 유지한다. 원본 `js/abi-schema.mjs`에 선택 `HWP5_CHART_LITERAL_EDIT_ABI`와 파생 FUNCTION 목록을 추가하고 `tools/generate-abi.mjs`에서 Zig schema를 생성한다. 초기 ABI 패킷은 공개 SDK, Core, Worker와 UI 진입점을 바꾸지 않았으며 이후 제품 연결은 위 계약에 기록한다. export 존재만으로 qualification 또는 UI capability를 활성화하지 않는다.

| export                                       | WASM params                                             | result                                 |
| -------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| hwp5_edit_chart_literal_edit_profile_version | 없음                                                    | i32, profile version2                  |
| hwp5_edit_chart_literal_edit_lease           | i32 section, i32 control                                | i32 성공1/거부0                        |
| hwp5_edit_chart_literal_edit_preview         | i32 JSON pointer, i32 bytes                             | i32 성공1/거부0                        |
| hwp5_edit_chart_literal_edit_commit          | i32 JSON pointer, i32 bytes, i32 PNG pointer, i32 bytes | i32 applied1/no-op2/rejected0/unknown3 |

새 SDK는 profile version1에서 막대 편집을, version2에서 막대와 꺾은선 편집을 지원한다. version1만 인식하는 이전 SDK는 version2 엔진에서 데이터 편집을 활성화하지 않으므로 같은 번들의 SDK와 WASM을 함께 사용한다.

읽기 결과와 오류는 기존 hwp5_edit_output_ptr/len/free와 오류 수명을 사용한다. 새 export는 full V2 History와 일치하는 현재 Session을 요구하고 poisoned/active transaction을 거부한다. query는 현재 Native 후보 목록에서 정확한 section/control 하나를 찾고 canonical XML·소유권·보호·field·자원 profile을 기존 편집 admission으로 재검증한다. display target에서 ticket이나 지원 profile을 만들어 내지 않는다.

## Portable lease와 preview

lease 응답은 schemaVersion1, scope `hwp5-chart-literal-edit-lease`, executionAuthority:false, witness, literals와 limits다. literals는 Native가 입장 증명한 categories와 series 이름·원문 values다. 범주 수와 계열 수 및 계열 이름은 편집할 수 없으며 기존 범주 이름과 숫자 값만 편집한다. query는 source-only core `Session.hwp5ChartLiteralEditLease`를 사용하며 소유 Lease의 context를 응답 생성 후 해제한다. 렌더링이나 History 변경은 만들지 않는다.

witness는 다음 필드를 모두 포함한다.

- profile enum 문자열 `spec24_clustered_column_literals_v1` 또는 `spec24_standard_line_literals_v1`.
- ticket의 document/generation/owner/epoch 네 u64. 각 값은 `{lo:u32,hi:u32}`로 전송한다. JS Number나 단순 History revision으로 합성하지 않는다.
- viewEpoch도 같은 두 word이고 historyRevision은u32다.
- owners는 기존 Native Target 전체: section, 전체 Site와 geometry·원본 section SHA, physical_id, resource_sha256.
- 원본 source_xml_sha256과 원래 pixel_width/pixel_height.

preview 입력은 `{schemaVersion:1,witness,edits}`다. edits는 기존 Native category/value tagged union과 원문 expected/value를 사용한다. 전체 ticket의 binding과 epoch, transport viewEpoch, 현재 History revision을 먼저 대조하고, Session이 full owners/resource/XML/보호·field/기존 pixel 치수를 다시 확인한다. 응답은 기존 `hwp5-chart-literal-edit-preview` scope와 executionAuthority:false, changed, 새 xml_sha256, 원래 pixel 치수, 공통 painter data다. field 부재·unknown field·중복 JSON key·다른 schema/profile은 거부한다.

portable witness는 위조 불가능한 JS private lease가 아니다. 정확한 현재 원문을 아는 raw ABI 호출자는 DTO를 구성할 수 있으므로 SDK/Core는 private registry와 frozen EditorState/token/선택 identity를 별도로 요구해야 한다. 임의 JSON lease 복원, display/current snapshot의 권한 승격 또는 HWPX wrapper로 control 주소 위장은 금지한다.

## Commit와 noncaller painter 경계

commit 입력 JSON은 `{schemaVersion:1,witness,edits,rendered}`다. rendered는 명시 null 또는 `{source_xml_sha256,pixel_width,pixel_height}`이고 PNG 바이트는 별도 pointer/length로 전달한다. null에는 PNG0바이트만 허용하고, metadata가 있으면 PNG가 비어 있을 수 없다. 값 변경에 PNG가 없거나 no-op에 PNG가 있으면 기존 Native 명령이 거부한다. 성공은 기존 단일 History/apply 경로를 쓰고 applied1과 known-no-op2를 구분한다. commit 후 별도의 응답 직렬화 실패로 재실행하지 않도록 status만 반환한다.

commit도 preview와 별도로 전체 ticket·view·revision을 확인한다. `validateHwp5ChartLiteralEditLease`가 전체 Plan witness와 원래 PNG 치수를 재검증한 뒤 기존 Command에 전달한다. 기존 Command가 거래 안에서 ticket/full witness를 다시 검사하며 새 XML과 실제 PNG의 hash binding·PNG 구조·CRC·치수, 전체 save/reopen 초안을 검증한 뒤 게시한다. 이 검사를 preview의 이전 성공으로 대체하지 않는다.

UI의 apply DTO에는 PNG, rendered 또는 trusted 플래그를 받지 않아야 한다. 최종 Worker mutation 안에서 같은 private lease/Plan으로 Native preview를 받고 실제 shared chart model painter를 호출한다. preview·paint·blob·arrayBuffer의 모든 await 뒤 state/token/target/lease/draft epoch를 재검사하고 Native commit 직전도 확인한다. 임의 callback이 반환한 PNG, UI 미리보기 cache, fixture 또는 기본 PNG를 commit에 넣지 않는다. 취소·생성 실패는 commit 전에 거부한다. Canvas는 finally에서 해제한다.

Native의 hash·CRC·pixel 검사는 painter의 실행 출처나 그림 의미를 인증하지 않는다. 이 raw ABI는 Worker를 암호학적으로 인증하지 않으며 SDK/Worker 경계를 구현했다고 주장하지 않는다. 제품의 private registry와 최종 raster 경로 및 실제 검증은 위 차트 데이터 편집 계약을 따른다. raw ABI 자체의 성공을 그 경계의 검증으로 대신하지 않는다.

## 명시 한도와 준비 검증

이번 optional wire는 JSON request/reply 각각16MiB, PNG8MiB를 명시한다. Native kernel의 기존 max_stream32MiB 의미와 원래 source 한도는 유지한다. 응답 한도가 부족하면 read-only encode에서 LimitExceeded로 거부한다. cap을 맞추려고 데이터나 기대값을 버리지 않는다. expected/value 합4MiB, owners128, logical edits20480, 기존 per-leaf·shape·pixel cap도 계속 적용한다. 입력 길이는 pointer slice/JSON parse 전에 검사한다. UTF-8·숫자·논리 키·canonical XML 검증은 기존 Native 계약을 따른다.

`src/hwp5_chart_literal_edit_lease_probe.zig`의 선별 명부는7 named+등록1을 준비한다. query 불변·ticket 상위word와 네 binding 축·view/revision·strict JSON/duplicate/unknown/schema·wire exact/+1·owner/resource/XML/pixel preview/commit 각 거부·no-op PNG pairing·응답 cap·undo/redo 후 lease 만료를 다룬다. 이는 실행 결과가 아니다. Native5d0 원본 검증, successor 집중 Native, 실제 full WASM ABI 비교, SDK/Worker·독립 edited raw·GUI를 별도 게이트로 유지한다.
