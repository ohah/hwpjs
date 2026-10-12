# 규제분석 원본 계산식 편집 검증

## 실제 원문과 공개 API

`reference/rhwp/samples/issue3637/regulatory_impact_nested_table_escape.hwpx`의841/976/1232번 문단은 FORMULA 필드 결과입니다. 일반 문자 입력의 UnsupportedFieldLabelRange는 이 결과를 보호하는 거부이며 정의 변경 API의 거부와 구분합니다.

원본 정의는 순서대로 `=SUM(B?:G?)`, `=SUM(ABOVE)`, `=SUM(B?:G?)`이고 LastResult는9,859/20.5/9,859입니다. `formulaSources(0)`의 begin_element는8424/9864/12458이며 정의는 row.values.formula에 있습니다. `setFormulaDefinition(section, beginElement, formula)`로 명시적으로 변경합니다. 조회 결과 자체를 영구 ID로 다른 원본에 재사용하지 않습니다.

## 현재 후보의 실제 편집

후보 WASM `field-exterior-table-input` SHA256 `1775eeeeeb6fa26a5ee5ea67e18f75898d704c78ba6cf88a66db82e81fcb0a73`에서 양쪽 정의를 `=AVG(B?,C?,D?,E?,F?,G?)`, 가운데를 `=SUM(G2,G3,G4,G5,G6,G7,G8,G9,G10,G11)`로 변경했습니다. 이 테스트는 원본 파일을 수정하지 않습니다.

독립 Python oracle는 원본 셀 숫자를 읽어 집계하고, 선택된 정의·Command·LastResult·표시 결과만 바뀌었는지 전체 XML 및 비대상 ZIP payload와 대조합니다. 검사기는 normal/-O로 실행하고 잘못된 기대 정의를 거부하는 부정 대조도 실행합니다. `HWPJS_TEST_WASM=/absolute/field-exterior-table-input/bin/hwpjs.wasm node --test tests/hwpx/regulatory-formula-reference.test.mjs`는1/1 exit0입니다. 세 정의 각각 저장·undo 원문 byte-exact·redo 수정본·재열기/재저장·원본 파일 불변을 확인했습니다.

## Worker와 실제 브라우저

같은 후보의 `regulatory-formula-worker.test.mjs`는1/1 exit0으로 세 정의를 실제 Worker 핸들러에 전달했습니다. 세 선택 항목·정의 편집 ABI 가용성, 편집 시작 전 EditorNotOpen, 변경 후 독립 숫자/전체 XML normal/-O·save·undo 원문·잘못된 수식 UnsupportedFormulaExpression와 redo 유지·redo 수정본을 확인했습니다. Node Worker 전역 어댑터 검사이며 브라우저 이벤트 검사와 구분합니다.

실제 Chromium에서는 임시 loopback 서버8097에 동일 후보를 주입하고 원본을 파일 입력으로 열었습니다. Canvas 편집 시작 후 속성 패널에 세 항목8424/9864/12458이 노출됐고, 첫 계산식을 `=AVG(B?,C?,D?,E?,F?,G?)`로 입력해 실제 버튼 click/submit으로 적용했습니다. 수식 적용 완료 응답·선택 항목 결과1,643.17·정의 입력 보존을 확인했습니다. 스크린샷은 `zig-out/verification/field-exterior-table-input/regulatory-formula-ui.png`입니다. 물리 쪽 배치 없이 텍스트 미리보기인 화면이므로 한글 원본 레이아웃 동등성의 증거가 아닙니다.

첫 자동 클릭은 버튼이 viewport 밖에 있어 이벤트가 발생하지 않았고25초 wait가 timeout됐습니다. DOM click/submit 관측을 추가하고 scrollintoview 후 두 이벤트와 성공 응답을 확인했으며, 최초 클릭을 통과로 계산하지 않습니다. 브라우저 검증은 첫 정의만이며 세 정의의 실제 브라우저·다운로드·UI 이력 검증은 아직 남습니다. 소유한 브라우저 세션과 임시 서버는 검증 뒤 종료했습니다.

## 남은 경계

`=AVG(ABOVE)`로 변경하면 다문단 머리글까지 선택해 UnsupportedFormulaCellParagraphs가 납니다. 일반 SUM의 텍스트 분류 정책과 AVG의 엄격 숫자 정책은 다르므로, 이를 원본 SUM 정의 자체가 지원되지 않는다는 증거로 사용하지 않습니다. 첫 조사에서 row.formula를 전달한 InvalidText는 검사 코드의 응답 구조 사용 오류이며 row.values.formula로 교정했습니다.

방향 집계와 다문단 머리글의 모든 의미를 한글 프로그램과 대조한 결과는 아직 없습니다. 이 문서는 세 명시적 정의 변경의 실제 저장/이력 검증만 소유하며 전체 계산식·전체 픽스쳐·Worker/Canvas UI 완료를 의미하지 않습니다.
