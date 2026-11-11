# CLI·MCP 폼 상태 연결

현재 GitHub 구현의 CLI/document 참조 연결 계약이다. 단일 @ohah/hwpjs 패키지의 현재 npm 버전 지원을 선언하지 않는다. Native/SDK 파서·상태·거래·저장을 재사용하며 별도 XML/CFB 제품 파서나 폼 모델 writer를 만들지 않는다.

## 조회와 기존 편집 진입점

`read --view structure`/MCP `read_document(view: structure)`와 `info`/`get_document_info`가 formControls를 포함한다. 기존 `object --ref`로 폼 한 개의 관측을 조회할 수 있다. source.node는 관측 정보이며 편집 인수로 받지 않는다. 기존 `hwpjs-object:<원본SHA>/<형식>/s<구역>/form/<NativeSourceID>` 참조를 기존 발급기·검증기로 처리한다. 새로운 참조 namespace나 패키지는 없다.

기존 apply/apply_document_changes의 strict 연산은 다음과 같다. 모두 `coordinates: "current-transaction"`이 필요하고 추가 키는 거절한다. 원본 expectedSha256과 새 outputPath도 기존 파일 호스트에서 검증한다.

| kind                | 필수 인수                                   | 형식                                         |
| ------------------- | ------------------------------------------- | -------------------------------------------- |
| form-checkbox-state | reference, expectedState, state             | HWP5/HWPX                                    |
| form-radio-select   | reference, expectedState, expectedGroupName | HWP5/HWPX                                    |
| form-text           | reference, expectedText, text               | HWP5 edit/combo_box, HWPX edit_box/combo_box |

체크박스는 UNCHECKED/CHECKED/INDETERMINATE이며 마지막 값은 triState=true를 요구한다. 라디오는 UNCHECKED/CHECKED이며 선택만 요청한다. Native가 그룹의 해제·선택을 한 거래로 수행한다. JS가 각 라디오 setter를 반복하지 않는다. 폼텍스트는 UTF-16 65535단위/UTF-8 196605바이트와 기존 전체 요청 예산을 모두 적용한다. 좌표·길이 단위를 변환하지 않는다.

현재 SDK 메서드는 HWP5 `supportsFormSources`, `supportsFormProperties`, `formSources`, `formAnchors`, `formProperties`, `supportsCheckBoxStateEdit`, `supportsRadioButtonSelect`, `supportsUnnamedRadioSelect`, `supportsFormTextEdit`, `supportsFormTextLayoutRetention`, `setCheckBoxState(section, formNode, state)`, `selectRadioButton(section, formNode)`, `setFormText({section, formNode, text})`다. HWPX는 `formSites`, `formSourceAttributes`, `checkBoxState`, `radioButtonState`, `formText`, `setCheckBoxState(section, formNode, state)`, `selectRadioButton(section, formNode)`, `setFormText({section, formNode, text})`를 사용한다. `supportsRadioButtonSelect`, `supportsUnnamedRadioSelect`, `supportsFormTextEdit`, `supportsFormTextLayoutRetention`은 실제 optional Native exports를 검사한다. optional HWPX setter의 존재는 열었던 실제 WebAssembly.Module의 export 목록에서 확인한다. 소스 DTO의 숫자 ID를 CLI 호출자가 쓰기 권한으로 제출하지 않는다.

## 관측·권한·지원 공백

HWP5 속성의 Native field/kind/u16 원값을 읽으며 부재·타입 불일치·미지 bool/state·잘못된 Unicode를 기본값으로 바꾸지 않는다. state/text는 현재 Native 속성 관측이다. HWPX checkbox/radio/text는 각각 Native 현재 getter를 사용하며 group/name/style은 source 관측으로 구분한다. 구형 Native에서 현재 getter가 없으면 unavailable이며 source 값으로 현재 상태를 꾸미지 않는다. JSON 표시에는 공통 structure escape를 적용하며 내부 원값은 보존한다.

writers는 해당 형식·종류에 대한 optional interface 존재 여부다. 현재 위치·Enabled/Editable/triState·ReadOnly/EditEnable·기대 상태와 Native의 최종 target 검증을 대체하지 않는다. Text layout retention flag는 AutoSize/WordWrap을 임의 쓰기 권한으로 해석하지 않도록 기존 SDK capability를 요구한다. MaxLength/숫자 모드/손상 및 실제 source version의 최종 값 검사는 기존 Native가 소유한다.

Native는 HWPX radio 선택과 edit/comboBox의 직접 hp:text 현재 조회·쓰기를 구현한다. 구역별 원본 identity와 현재 pending 값이 결합되며 이름 있는 radio 그룹은 문서 전체에서 하나만 선택한다. source owner·비대상 XML·스타일·글꼴·모든 form metadata를 보존한다. 중복 hp:text/중첩 요소/부재·미지 권한은 Native가 거절한다. 그룹 변경은 준비 후 한 번 교체하며 Native history 한 항목이다. 구형 writer가 없으면 `FormWriterAbiUnavailable`로 전체 입장 전에 거절한다. XML을 JS에서 작성하지 않는다.

현재 Native의 unnamed capability는 고립된 명시 빈 그룹명 라디오를 지원한다. 명시 빈 그룹명 라디오 2개는 Native의 `AmbiguousUnnamedRadioGroup` 거절을 유지한다. optional flag가 없는 엔진은 `UnnamedRadioSelectAbiUnavailable`이며 writer를 호출하지 않는다. 합성 HWP5 5.0.3.0 source profile은 성공했고 5.0.1.7 profile은 Native의 `UnsupportedFormSourceVersion`으로 거절됐다. 문서 버전을 자동 변경하지 않으며 이 두 실측을 모든 버전의 지원 판정으로 확대하지 않는다.

## batch·소유권·수명

모든 schema/ABI/종류·권한·초기 기대값과 source 참조를 첫 쓰기 전에 검사한다. historyV2는 정적 ABI 입장 이후 lazy enable하며 old optional writer 부재이면 history/setter/save를 호출하지 않는다. 최초 Native form source/anchor/paragraph owner·불변 속성을 snapshot으로 보존한다. 구역별 flow 인덱스를 한 번 만들며 폼마다 전체 flow를 filter하지 않는다.

쓰기 직전 동일 문서 객체·SDK·형식·원본 SHA와 현재 SourceSplitBinding의 session/revision/비되감기 serial을 확인한다. 새로운 현재 Native inventory가 최초 fingerprint와 일치하고 기대 상태도 일치해야 한다. caller가 fingerprint나 binding을 발급하지 않는다. 각 form writer가 끝나면 동일 session의 단일 revision+1/serial+1 또는 완전한 no-op만 받아들인다. 미래 대상의 최초 fingerprint를 덮어쓰거나 serialized 숫자를 새 대상으로 재해석하지 않는다. undo/redo ABA와 foreign 문서는 거절한다.

변경 후 현재 관측·owner 보존과 side effect 범위를 검증한다. 체크박스/텍스트는 선택 대상의 해당 값만, radio는 Native가 관측한 같은 nonempty 그룹 또는 singleton 자신만 허용한다. 그룹 내 최종 상태도 확인하되 JS에서 상태를 작성하지 않는다. affected 관측 비교는 Map을 사용하며 내부 F² 검색을 하지 않는다. Native/SDK의 전역 inventory 조회는 각 동기 writer 전후 필요하므로 전체 배치 비용의 선형성을 주장하지 않는다. provenance는 개별4Mi UTF-16단위/전체16Mi단위로 제한하며 표시 출력은4MiB로 제한한다.

현재 보수적 입장 범위는 폼 연산 prefix다. 폼보다 앞선 비폼 연산을 거절한다. 동일 form의 초기/쓰기 직전 기대값이 모두 맞아야 하므로 앞선 폼 변경으로 다음 기대값이 달라졌다면 거절한다. 별도 재바인딩·예측 모델을 만들지 않는다. 기존 문자 확장/원본 셀 split의 수명 입장 제약도 유지한다. Native가 해당 조합을 지원하지 않는다는 주장과 CLI 입장 범위를 구분한다.

파일 저장과 종료가 모두 성공한 뒤에만 새 바이트를 게시한다. 후행 오류는 세션을 버리고 새 출력이 없다. 입력 덮어쓰기는 기존 호스트가 거절한다. 저장한 새 파일에서는 새 SHA로 참조를 다시 조회한다. 파일 호스트 검증과 열린 Native 세션 undo·공개 GUI 입력/표시 검증은 별도 증거로 구분한다.

## 검증과 출처

Node24.20.0에서 packages/cli/tests/form-state.test.mjs와 별도 명시 packages/cli/e2e/form-state-bridges.test.mjs를 실행한다. E2E는 HWPJS_TEST_WASM, 정확 HWPJS_TEST_WASM_SHA256, 존재하지 않는 절대 HWPJS_FORM_EVIDENCE를 요구한다. 선택 HWPJS_FORM_CLI_ENTRY/HWPJS_FORM_MCP_ENTRY는 같은 시나리오를 빌드된 실행 파일로 재사용한다. 구형 ABI 반례는 optional export mask와 별도 실제 이전 P4 Native505 엔진을 모두 사용한다. 실제 이전 엔진 검증은 HWPJS_FORM_PRIOR_WASM/HWPJS_FORM_PRIOR_WASM_SHA256을 함께 명시하며 한쪽 누락·불일치는 실패다. 둘 다 생략한 정규 CI는 export-mask-only로 기록하며 실제 과거 엔진 증거로 집계하지 않는다. 이 후보의 로컬 source/archive 검증은 실제 P4 엔진을 명시했다.

fixture는 Native 새 문서/CFB writer와 테스트 전용 HWP5 레코드 authoring·표준 ZIP으로 생성한다. 제품 파서를 기대값으로 사용하지 않는 독립 CFB/XML oracle가 비대상 원문·metadata까지 비교하며 normal/-O와 잘못된 기대 상태를 모두 검사한다. 고립 unnamed와 복수 unnamed, source version 거절은 별도 사례다. 제품 구현 근거는 현재 SDK 계약과 직접 Native 관측이다. 기존 소유 독립 CFB reader의 컨테이너/레코드 부분만 재사용한다. 엄격한 클린룸 절차 완료나 모든 폼/문서의 무손실 저장을 주장하지 않는다.

## Native·화면 검증 경계

현재 통합 후보는 기존 Main Native503에 폼 optional6개를 추가한509개이며 global ABI6/history2를 유지한다. 기존503개 export의 이름·종류·함수 arity를 보존한다. 미배포 원본 표 identity 후보의 optional exports는 포함하지 않는다. 정확 새 SHA는 제품 known profile에 등록하고 COW40을 별도 등록 hook 없이 실행했다. 열린 Native 세션의 undo/redo·단일 이력·할당 실패·후행 실패는 별도 probe로 검증한다. 문서 폼 metadata를 버리지 않고 Native XML source writer로 변경한다. HWPX 숫자 전용 edit는 ASCII 숫자만, 줄바꿈은 multiLine=true일 때 허용하는 보수적 제품 profile이다. 이 정책을 공식 스키마의 전 범위로 확대하지 않는다. Canvas 입력은 Native inline geometry/font/known flags가 검증된 폼만 노출한다. 명시 LF 다중행 입력은 [별도 화면 계약](hwpx-form-multiline-preview.md)의 고정 프레임 profile을 따른다. CLI Native 지원과 GUI 표시 범위는 구분한다.

Native 저장·소유권·출처·화면 profile의 상세 계약은 [HWPX 폼 상태 편집](hwpx-form-state-editing.md)을 따른다.
