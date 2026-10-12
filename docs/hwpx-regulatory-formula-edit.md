# 규제분석 원본 계산식 편집 검증

## 실제 원문과 공개 API

`reference/rhwp/samples/issue3637/regulatory_impact_nested_table_escape.hwpx`의841/976/1232번 문단은 FORMULA 필드 결과입니다. 일반 문자 입력의 UnsupportedFieldLabelRange는 이 결과를 보호하는 거부이며 정의 변경 API의 거부와 구분합니다.

원본 정의는 순서대로 `=SUM(B?:G?)`, `=SUM(ABOVE)`, `=SUM(B?:G?)`이고 LastResult는9,859/20.5/9,859입니다. `formulaSources(0)`의 begin_element는8424/9864/12458이며 정의는 row.values.formula에 있습니다. `setFormulaDefinition(section, beginElement, formula)`로 명시적으로 변경합니다. 조회 결과 자체를 영구 ID로 다른 원본에 재사용하지 않습니다.

## 현재 후보의 실제 편집

후보 WASM `field-exterior-table-input` SHA256 `1775eeeeeb6fa26a5ee5ea67e18f75898d704c78ba6cf88a66db82e81fcb0a73`에서 양쪽 정의를 `=AVG(B?,C?,D?,E?,F?,G?)`, 가운데를 `=SUM(G2,G3,G4,G5,G6,G7,G8,G9,G10,G11)`로 변경했습니다. 이 테스트는 원본 파일을 수정하지 않습니다.

독립 Python oracle는 원본 셀 숫자를 읽어 집계하고, 선택된 정의·Command·LastResult·표시 결과만 바뀌었는지 전체 XML 및 비대상 ZIP payload와 대조합니다. 검사기는 normal/-O로 실행하고 잘못된 기대 정의를 거부하는 부정 대조도 실행합니다. `HWPJS_TEST_WASM=/absolute/field-exterior-table-input/bin/hwpjs.wasm node --test tests/hwpx/regulatory-formula-reference.test.mjs`는1/1 exit0입니다. 세 정의 각각 저장·undo 원문 byte-exact·redo 수정본·재열기/재저장·원본 파일 불변을 확인했습니다.

## 남은 경계

`=AVG(ABOVE)`로 변경하면 다문단 머리글까지 선택해 UnsupportedFormulaCellParagraphs가 납니다. 일반 SUM의 텍스트 분류 정책과 AVG의 엄격 숫자 정책은 다르므로, 이를 원본 SUM 정의 자체가 지원되지 않는다는 증거로 사용하지 않습니다. 첫 조사에서 row.formula를 전달한 InvalidText는 검사 코드의 응답 구조 사용 오류이며 row.values.formula로 교정했습니다.

방향 집계와 다문단 머리글의 모든 의미를 한글 프로그램과 대조한 결과는 아직 없습니다. 이 문서는 세 명시적 정의 변경의 실제 저장/이력 검증만 소유하며 전체 계산식·전체 픽스쳐·Worker/Canvas UI 완료를 의미하지 않습니다.
