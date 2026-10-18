# HWP5 원본 입력 적격성의 UI 전달

## 짝 불명 표식의 native 진단

`local_field_spans.inspectReadableBound`는 기존 scanner와 원본 논리 리스트 소속 검사를 재사용해 `Report{spans, unresolved}`를 반환합니다. 닫힌 marker 쌍만 spans에 넣고 짝 불명 표식은 `unclosed_start`/`orphan_end`로 분리합니다. 시작의 position은 8유닛 표식 바로 뒤, 종료의 position은 종료 표식 시작입니다. `marker_id`는 해당 표식의 원시 ID이며 고아 종료의 ID를 가상 시작 ID로 바꾸지 않습니다. ordinal은 시작만 가지며 list_node는 실제 원본 리스트 노드 또는 루트의 null입니다. 진단은 문단/UTF-16 위치순으로 반환합니다. 호출자가 두 소유 배열을 `Report.deinit`으로 해제합니다.

미지 시작 종류·짝 ID 불일치·원본 바인딩 오류·중첩 상한·OOM은 진단 모드에서도 오류입니다. 기존 strict collector는 동일 scanner에 진단 수집 없이 진입하므로 미닫힘/고아 표식을 계속 거부합니다. 이 보고서는 **marker 토폴로지 진단**이며 CTRL_HEADER 속성 바인딩·명령 평가·편집 허가를 인증하지 않습니다. 종료 위치를 만들거나 원문을 고치지 않습니다. 아직 JS/WASM 공개 진단 API·Canvas·복구/편집 거래에 연결하지 않았습니다.

`field_topology_tests.zig`에 별도 테스트를 두고 기존 scanner 테스트와 함께 root에 명시적으로 등록했습니다. 실제 원본에서 닫힌28범위와 문단52/위치8/리스트236의 미닫힘1개를 확인했습니다. 합성 고아 종료·미닫힘 동시 존재/정렬, 전체 부분 할당 실패와 해제, 잘못된 ID·미지 시작·위조 source node·33중첩 반례도 검사합니다. 분리 게시 소스의 ReleaseSafe/Debug는 각각12/12·skip0입니다. 초기 실파일 읽기 한도 부족과 디스크 공간 부족으로 실패한 실행은 성공에 포함하지 않았습니다.

ReleaseSafe 제품 빌드는5/5단계 성공, 후보 SHA-256은 `7c38bc1bb2df912024b09619d2cd6d889ab472a04fe20a3edc4e6063fe7276dd`입니다. 이 후보의 기존 API/Worker 정책·필드 wire/ABI/원본 oracle·구간 의존성 집중8파일은18/18·실패/취소/건너뜀0입니다. 로그는 `/tmp/hwpjs-browser-policy-fault.wHp4QV/topology-native-safe.log`·`topology-native-debug.log`·`topology-build-safe.log`·`topology-js-focused.log`입니다. 전체 최신 native/편집 묶음·브라우저·기본 데모 승격이나 해당 문서의 편집 완료 결과는 아닙니다.

## 실제 종료 표식 부재의 구분

`reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp`는 기본 편집 세션 열기와 원문 조회는 가능하지만 원본 텍스트 정책은 `UnsupportedCrossParagraphField`입니다. 독립 CFB.js·Node 압축 해제·레코드 관측에서 Section0의1531문단에 필드 시작29개·종료28개를 확인했습니다. 논리 리스트별 독립 관측에서는 문단52/UTF-16위치0의 `%clk` 시작(레코드238, 소유 컨트롤220/리스트236)이 닫히지 않았습니다. 단순히 문단 경계 통과를 금지한 것으로 단정하거나 문서 전체가 손상됐다고 판정하지 않습니다. 닫는 위치를 임의로 추정하지 않는 현재 엄격 편집 정책의 제한입니다.

`text-source-policy-api.test.mjs`에 실제 원본의 표식 개수/시작 위치, native 정책과 실제 splice 거부, 저장 바이트·undo/redo·디스크 원본 불변 회귀를 추가했습니다. `57444ae68a357b70528c6da5394f009060de4c09fcf61af3fa91fb755a708637` 후보와 게시 소스의 API에서3/3·실패/건너뜀0입니다. 이 결과는 자동 복구나 이 원본의 편집 지원 완료가 아닙니다. 종료 표식 부재를 보존하면서 다른 범위를 편집하려면 필드 범위 불명확성을 명시하는 별도 모델/저장 검증이 필요합니다. 앞선 전체455개 성공은 이 새 회귀 추가 전 결과입니다.

문단의 텍스트가 표시/선택 가능하다는 사실은 그 문서의 입력 거래가 허용된다는 뜻이 아닙니다. `hwpspec.hwp`에서는 문단 로컬 editable 표시가 true였지만 다른 구역의 미지원 상호참조 때문에 native splice가 거부됐습니다. 이 불일치를 고치되 [글자 서식 보존](hwp5-table-number-format-retention.md)과 일반 입력 권한을 합치지 않습니다.

## 책임과 범위

`edit/text_source_policy.validate`는 원래 source_policy의 선택/비선택 구역 검사와 field_source_bindings를 재사용합니다. 규칙·태그·참조값을 JS에서 재해석하지 않습니다. Session의 `validateTextSourcePolicy`는 불변 decoded source를 검사할 뿐 텍스트·리소스·저장 기준·이력을 변경하지 않습니다. 이것은 원본 차원의 **필요조건**이며 모든 문단/범위의 편집 성공이나 객체/필드 결과 직접 입력을 보장하지 않습니다. 기존 native 명령의 최종 검사는 유지합니다.

선택 구역에 named field가 있으면 기존 field transaction 정책과 원본 바인딩을 검증하고, 없으면 기존 formula-aware 정책을 사용합니다. 다른 구역은 기존 validateUnselectedSection을 그대로 사용합니다. 따라서 unknown/control/cross-section 제한을 보존하며 글자 서식 전용 표 번호 허가를 일반 입력에 전달하지 않습니다.

optional export `hwp5_edit_validate_text_source_policy(section)`는 성공1, 실패0과 기존 error 채널을 사용합니다. JS의 `supportsTextSourcePolicy()`로 존재를 확인하고 `validateTextSourcePolicy(section)`는 성공 시 반환값 없이 종료하거나 native 오류를 던집니다. 인자는 u32 구역 번호이고 닫힌 세션은 거부합니다. output 버퍼/이력 변경용 명령이 아닙니다.

`hwp5-text-source-policy.mjs`는 표시 응답 안에서 구역별 한 번만 조회합니다. 실패하면 원인 문자열을 textSourcePolicyError에 보존하고 editable=false로 내려갑니다. 원래 선택 가능하고 잘리지 않은 텍스트는 selectable=true로 유지해 서식 편집을 허용합니다. 성공한 조회가 원래 보호 문단을 editable=true로 승격하지는 않습니다. 응답 사이에 실패/성공 캐시를 보관하지 않으며 OutOfMemory도 입력 허가로 바꾸지 않습니다.

구형 WASM에 export가 없으면 textSourcePolicyAvailable=false이며 기존 ABI 동작을 유지합니다. 이는 native 판정을 통과한 상태가 아닙니다. 새 판정의 UI 보장은 해당 export가 있는 후보/제품에만 적용합니다. 기본 제품 WASM·데모 승격은 별도 검증 대상입니다.

## 검증

앞선 브라우저 이력 확인의 시간 초과는 완료 신호를 너무 이르게 판단한 검사 오류였습니다. 대기 중에는 selectedCharacterPropertyState가 null이며 비활성 버튼의 aria-pressed가 false가 될 수 있습니다. 버튼 재활성화 뒤 값과 거래 완료 상태를 확인하는 조건으로 재검증했습니다. 연결 테스트도 pending 중 null/미정착, 응답 뒤 정착, undo/redo 뒤 선택 굵게 값과 읽기 전용 상태 복원을 검사합니다. aria 값만으로 완료를 판정하지 않습니다.

같은 분리 소스·후보의 새 Chromium 세션에서 hwpspec을 파일 선택→명시적 보정본 동의→편집 시작→찾기로 열고 `(Hwp Document File Formats)`의 Hwp Document 부분(구역0/문단6/원본 UTF-16 범위1..13)을 선택했습니다. readOnly=true·disabled=false를 유지한 채 굵게 true→false, undo→true, redo→false를 각 버튼 재활성화 후 확인했습니다. 이전 실행의 키보드 입력 시도에서도 읽기 전용 텍스트는 바뀌지 않았습니다. 이는 물리 OS IME 검사는 아닙니다.

이번 Chromium 실행에서는 변경 전 보정본·undo 후·redo 후 파일을 실제 다운로드했습니다. 보정본과 undo 파일은 바이트 단위로 동일했고, 보정본의 전체 스트림은 원본의 스트림과 동일했습니다. redo 후 첫 저장은 LayoutReflowRequired로 거부됐고 동의가 선택되지 않은 것을 확인한 다음 직접 체크해 저장했습니다. 실제 다운로드 파일을 독립 verifyCharacterProperties로 검사해 DocInfo 전체·모든 decoded 구역·비대상 스트림을 예상 변경과 대조했습니다. 반대 굵게 값을 요구한 반례는 실패했습니다. 다운로드한 편집본을 브라우저에 재업로드·다시 편집 시작·같은 찾기 결과 선택 후 굵게 false/같은 텍스트/readOnly=true가 유지됐습니다. 수집된 브라우저 오류는 없었고 사용한 세션·서버는 종료 확인했습니다. 원본 CFB 메타데이터까지 보존하는 저장이나 전체 객체·페이지 조판 동치를 주장하지 않습니다. 해당 문서는 표시 한도와 UnsupportedHwp5RectangleRoot에 따른 페이지 배치 제한이 여전히 있습니다.

분리한 main 기준 native ReleaseSafe/Debug 각각2/2와 ReleaseSafe WASM 빌드가 통과했습니다. 실제 tracked field 문서의 모든 부분 할당 실패·원본 불변, 잘못된 구역, 선택/다른 구역의 미지 컨트롤 거부를 검사합니다. 후보 SHA256은 `c8c6e8ab17e1e2426e01c1ec70293912c04a86dfcba1aa572df5a420479ff9c5`입니다.

공개 API·Worker/Canvas 연결·기존 보정본/배포/보호 정책 집중검사12/12·skip0입니다. 새 source query의 저장/이력 불변·허용 문서의 후속 입력, 잘못된 u32, 닫힌 세션, optional export를 이름 변경해 제거한 실제 모듈 거부를 검사합니다. 표 번호 참조 문서는 beforeinput을 UI에서 거부하고 요청을 내보내지 않지만 선택 서식 변경·독립 전체 저장 대조·undo/redo는 통과했습니다. Canvas controller 확대 회귀와 API를 함께 실행한 별도 묶음도200/200·skip0입니다. 두 묶음의 중복 API 검사를 합산하지 않습니다.

명령: `zig test src/root.zig -O ReleaseSafe --test-filter 'text source policy queries'`와 Debug. 후보를 `HWPJS_TEST_WASM`으로 지정해 `node --test --test-concurrency=1 tests/hwp5/text-source-policy-content.test.mjs tests/hwp5/text-source-policy-api.test.mjs tests/hwp5/table-number-format-canvas.test.mjs`를 실행합니다. 전체 native 전수·모든 픽스쳐 입력·조판 동치 완료의 증거로 사용하지 않습니다.
