# 제목 표식과 책갈피 필드의 텍스트 편집

후속 Worker/Canvas 반례와 실제 Chromium 입력·다운로드·재업로드는 [브라우저 검증](hwpx-title-field-browser-roundtrip.md)을 따릅니다. 아래 API 단계의 미검증 기록을 당시의 범위와 구분합니다.

## 소유권과 허용 범위

실제 `reference/rhwp/samples/추진일정.hwpx`의 구역0/문단1은 구역 설정·단 설정·빈 제목 표식과 닫힌 BOOKMARK 필드를 함께 갖습니다. 전체 문단 편집은 계속 거부하고, 기존 `fieldLabels`/`spliceFieldLabel`의 연결·종류·선택 소유권 검사를 통과한 필드 텍스트만 허용합니다. BOOKMARK의 기존 editable 값 해석을 바꾸거나 새 API를 만들지 않습니다.

`plain_paragraph_policy.zig`는 필드 텍스트 모드에서 보존 가능한 필드 마커와 구역 설정을 제목 혼합 거부 대상으로 세지 않습니다. 일반 본문·anchor·문자 서식 모드에 이 예외를 적용하지 않습니다. 적격성 검사는 text_sites에 없는 빈 hp:t의 직접 자식도 순회합니다. 따라서 알려지지 않은 빈 인라인 요소를 텍스트가 없다는 이유로 건너뛰지 않습니다. 설정·마커 내부 문법은 기존 retained 검사기가 계속 소유합니다.

`title_mark_axis.buildForFieldText`는 기존 공통 제어 폭을 사용해 보존 필드 마커의 파생 좌표만 만듭니다. 표시 폭은0이며 원문/연결/편집 권한을 소유하지 않습니다. 기본 build는 필드 혼합을 계속 거부합니다. `paragraph_text_positions`는 검증된 필드 텍스트 경로에서만 이 모드를 선택합니다. 원문 축 보고서를 편집 캐시로 저장하지 않습니다.

## 실측과 반례

분리 소스 `/tmp/hwpjs-title-field-probe.qk5Wuj`의 v3 이전 후보들은 실제 필드 조회가0개여서 실패했습니다. 직접 native 진단으로 제목 혼합 적격성의 구역 설정 거부를 확인했습니다. v3의 실제 저장/독립 대조는 통과했지만 빈 텍스트 소유자 안의 미지 요소 반례가 조회를 허용했습니다. 최종 v4는 실제 XML 직접 자식을 검사하도록 보강했습니다. 중간 실패를 최종 통과로 합산하지 않습니다.

최종 ReleaseSafe WASM `candidate-v4/bin/hwpjs.wasm`의 SHA256은 `2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c`입니다. `title-regression-v4.log`는7/7·fail/skip/cancel0·exit0입니다. 실제 제목12문단, 기존 책갈피, 중첩 필드와 새 제목 책갈피를 포함합니다. `title-main-api-v4.log`의 현재 JS 연결도2/2·같은 오류0·exit0입니다.

같은 후보의 `title-other-fields-v4.log`도7/7·fail/skip/cancel0·exit0입니다. 기존 메모 라벨/주석·부정 메타데이터·두 실제 라벨, 생성 표가 있는 필드와 필드 바깥 개행을 함께 검사합니다. 두 묶음은 서로 다른 테스트 목록이며 전체 편집 gate로 바꾸지 않습니다.

새 공개 테스트는 실제 입력·emoji/XML 특수 문자·원본 undo·저장 redo·재열기·재저장 동일성을 검사합니다. Python 일반/-O 모드가 XML 전체·비대상 ZIP 항목과 메타데이터를 독립 비교하고 잘못된 예상 텍스트를 거부합니다. BOOKMARK 종류 변조, 알 수 없는 빈 인라인/직접 run 컨트롤, 자식이 있는 제목 표식은 label을 제공하지 않고 저장 원문·대기 redo를 보존해야 합니다. 서로게이트 내부/금지 XML 문자 오류와 빈 입력도 이력을 훼손하지 않아야 합니다.

`title_field_label_tests.zig`의 ReleaseSafe/Debug 집중 검사는 각각3/3·skip0·exit0입니다(`title-native-safe-v4-retry.log`, `title-native-debug-v4.log`). root 등록1개와 assertion2개이며 합산하지 않습니다. 파생 축/문단 위치 생성의 전체 할당 실패 지점과 실제 파일 저장/재열기를 검사합니다. 실패 주입 도중의 OutOfMemory를 잘못된 expectError로 삼켰던 초기 테스트는 수정 후 재실행했습니다.

전체 native gate·모든 필드 명령·실제 브라우저 입력·한글 조판 동치의 완료가 아닙니다. 기본 배포 WASM을 교체하지 않았으며 다른 거부 문단의 지원으로 확대하지 않습니다. 재현은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/title-field-prefix.test.mjs`입니다. native는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX title field'`이며 Debug도 같은 필터입니다.
