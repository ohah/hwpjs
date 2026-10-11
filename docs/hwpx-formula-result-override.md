# 수식 결과 직접 수정 — 내부 저장 기반

현재는 미커밋 작업 트리의 내부 구역 XML writer만 구현했습니다. 공개 세션·WASM·Worker·Canvas 지원으로 해석하지 않습니다.

후속 현재 상태: 내부 flat Session.save와 checkpoint까지 연결했으며 아래 최초 writer-only 기록을 대체합니다. 공개 편집 명령/표시/재계산/UI는 여전히 연결 전입니다. 아래 회귀 결과는 각 단계 snapshot에만 적용합니다.

재열기 표시 후속과 미해결 거래: aaf 후보에서 수동 결과 저장/재열기 후 본문은 `수동😀<&`, current/source cache는67.5인 불일치를 재현했습니다. dirty만 수동 전용 표식으로 추측하지 않습니다. 로컬 ParaList schema의 dirty는 xs:boolean/default false이고 [한컴 모델의 고정 commit fieldBegin](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/fieldBegin.cpp)도 boolean/default false의 읽기/쓰기만 보여 줍니다. 실제 편집기의 수동 결과 표시/재계산 프로토콜을 이 모델만으로 확정하지 않았으며 코드를 이식하지 않았습니다.

`formula_source_display`는 read projection에서 공통 source binding/text 비교로 변경 없는 구역을 확인하고 실제 결과 본문을 읽습니다. 공통 준비의 계산/선택/구조 검증은 유지하며 source display 준비값은 파라미터 보존으로 표시합니다. writer의 자동 계산 정책을 이 read 옵션으로 대체하지 않습니다. current 수식·서식/좌표 조회는 같은 옵션을 사용하고 정의/text 변경이 있으면 기존 계산 경로를 따릅니다. 이 동작은 원본 표시값 보존이지 수동 사용자 편집이라는 영속 판정이 아닙니다. copay 원문의 표시100은 current 조회에도100이며 source cache/계산184.9와 구분합니다. 이전 derived current184.9 기록/기대값은 이전 계약입니다.

최초 helper는 단일 오류 집합에 불필요한 else를 두어 native/WASM 컴파일 exit1로 실패했습니다. 공통 비교 함수의 실제 InvalidTextSites 오류만 명시한 수정 후 native19/19·exit0(root1+실제18선언), ReleaseSafe6/6·exit0(54초)을 확인했습니다. 후보 `formula-source-display/bin/hwpjs.wasm` SHA256 `068b392b6b4fd89dc126bffbdeb73583303c8c63836094f7895b49235bc7f11d`의 공개4파일14/14·exit0·skip0(43366.477ms)은 재열기 표시/6UTF-16 서식 폭·기존 정의/48정확 숫자/text SUM/독립 저장 반례를 포함합니다. source 비교의 전체 할당 실패·누락/잘못된 binding/text 변경 반례도 native 검사에 포함했습니다.

그 뒤 두 수동 결과를 저장/재열기하고 첫 수식 입력11.2→12만 바꾸는 추가 반례는 첫 결과68.3과 달리 관계없는 두 번째 결과가 `다른 수동`에서73.9로 바뀌었습니다. 별도 공개 회귀1실패·exit1(743.116375ms)로 고정했으며, 앞선14통과를 최종 전체 수동 결과 지원으로 해석하지 않습니다. 새 회귀/ runtime은 미커밋입니다. 재열기에서는 overlay 소유 상태가 없어서 전체 준비가 다른 보존 결과까지 자동 계산하는 것이 남은 원인입니다. 원본에서 보존된 표시값의 소유/자동 계산 상태 복원 및 입력/정의 수정 시 해당 결과만 해제하는 거래가 다음 구현 gate입니다. 기본 제품/Worker/UI를 승격하지 않았습니다.

참조 입력 재계산 후속: b29 API 후보에서 실제 chart의 수동 결과를 설정한 뒤 native 문단20의11.2→12를 입력해도 첫 current 결과가 수동으로 남는 누락을 재현했습니다. 후속 `formula_result_override_invalidation`은 일반/투영된 flat splice의 draft에서 활성 변경 셀을 수집하고 공통 dependency evaluator의 실제 입력 read observer로 해당 수식의 참조를 구합니다. 숫자/설명/빈 셀·재귀 평가의 실제 read를 관찰하며 별도 범위 파서나 영속 dependency cache를 만들지 않습니다. observer의 주소 dedup은 산술의 반복 참조를 제거하지 않습니다. observer/변경 셀 매칭과 복수 root 평가의 셀·검사 예산은 공유합니다. 관련 override만 후보에서 clear한 뒤 공통 준비 성공 후 Sites/override 소유권을 함께 교체합니다. no-op/실패는 기존 상태를 바꾸지 않습니다.

정의 고치기도 후보 정의/override를 함께 검증·교체하며 해당 override만 제거합니다. 같은 원본 정의를 명시적으로 다시 설정해도 override가 있으면 재계산 거래로 처리합니다. 최초 정의 경로가 override를 알지 못한 채 정의만 게시해 후속 저장에 충돌할 수 있던 문제를 방지합니다. 수동 결과를 pending 새 정의에 다시 설정하는 역순·다른 수식의 수동 결과 의존·구조/rebase 등은 아직 지원/검증이 필요합니다.

최종 native19/19·exit0(root1+기존 정의OOM1+수동 결과17선언)은 입력→override 해제의 전체 할당 실패 원자성, 실제 관련 첫 결과68.3/관계없는 두 번째 수동 값 유지·저장 이력/거부 후 redo 보존, AVG 및 동일 SUM 재설정의 명시적 재계산/이력을 포함합니다. 후속 작업 트리 ReleaseSafe6/6·exit0(43초), 후보 `formula-manual-recalculate/bin/hwpjs.wasm` SHA256 `aafc4b5797629f391ca8887d145d69a17b1df13b0e0951376687a06d458134ed`에서 실제 누락 재현이68.3으로 해결됐습니다. 최종 공개7/7·exit0·skip0(1820.923375ms)은 원래 API6회귀와 새 관련 입력 재계산을 포함합니다. 새 독립 oracle 모드는 관측 첫 수식의 셀 주소/단일 숫자4입력·원래SUM67.5를 확인하고 Decimal로11.2→12 이후68.3을 계산합니다. 기대 XML에는 해당 입력/첫 필드cache/dirty/본문만 바꾸고 다른 수동 결과까지 그대로 대조합니다. 일반/-O5변조 거부와 저장/undo/redo/잘못된 숫자 거부 후 수동 값 보존을 확인했습니다. runtime/새 공개 테스트는 여전히 미커밋이며 전체 gate·재열기 수동 상태 판별·Worker/UI 완료로 확대하지 않습니다.

native 세션 거래 후속 상태: `Session.setManualFormulaResult(section, begin, display)`는 소유 후보 clone/set→일시적 Section view의 전체 save 검증→ownership swap 순서입니다. 저장이나 검증 실패는 원래 override를 변경하지 않습니다. native history의 새 `formula_result_override` 종류는 기존 enum 끝에 추가했고 필드 전체 치환용 start/deleted0만 허용합니다. 기존 checkpoint rollback/undo/redo를 재사용합니다. 구조/생성 표 host는 아직 미지원 오류로 거부하며 향후 지원 대상에서 제외하지 않습니다. WASM 내부 공통 명령 switch도 새 enum을 처리하도록 연결했지만 export/JS/Worker/UI 설정 경로는 아직 추가하지 않았습니다.

선택적 WASM/JS 후속 연결: `hwpx_edit_set_manual_formula_result`와 native 공통 표시 한도 조회 export를 추가했습니다. JS `editor.setManualFormulaResult(section, beginElement, display)`는 기존 응답 모양을 바꾸지 않는 void 명령이며 오류를 throw합니다. setter/한도 export 중 하나라도 없으면 HwpxManualFormulaResultAbiUnavailable로 거부합니다. UTF-8 바이트 예산은 native 한도에서 읽고 잘못된 한도·u32 대상·문자열/UTF-16·과도한 입력을 거부합니다. Worker/UI는 아직 설정 명령을 연결하지 않았고 재계산/재열기 상태 정책도 남습니다.

작업 트리 ReleaseSafe6/6·exit0(44초), `formula-manual-api/bin/hwpjs.wasm` SHA256 `b29db42a7b07cf13b06311d6868981da8d4e5c1b07516444bb409e4c6e0d8634` 후보에서 최종 공개6/6·exit0·skip0(1056.377166ms)을 확인했습니다. 실제 chart의 수동 결과/문단 표시·원본 source cache 보존·no-op revision·undo/redo·거부 후 redo/원문/revision 보존·저장 재열기 및 독립 reader 텍스트를 검사했습니다. 독립 수동 결과 저장 oracle은 선택된 FORMULA의 실제 begin/end 사이 단일 직접 텍스트만 기대 XML에 바꾸고 모든 파라미터/dirty/기타 본문·비대상 ZIP payload/metadata/순서/CRC를 대조합니다. 일반/-O에서 결과·cache·dirty·다른 본문·다른 header5변조를 각각 거부했고 인프라 오류는 음성 성공으로 인정하지 않습니다. mutation은 원래 문자열과 반드시 다른 값으로 생성합니다. 한쪽 ABI 누락2경우, 한도0/NaN/UTF-8 멀티바이트32예산3경우도 setter 미호출/원문 보존을 확인했습니다.

최초 공개 실행은8×64MiB의 이력 예산이 기존 WASM128MiB 합산 상한을 넘어 enableHistory에서 LimitExceeded로 종료했습니다. 제품 상한을 풀지 않고 테스트를8×4MiB로 정정한 뒤 양성 편집을 실제 실행했습니다. 최초 실패를 파서 실패나 수동 결과 통과로 계수하지 않습니다. runtime/새 공개 테스트는 미커밋이며 기본 제품 WASM 승격·전체 gate·Worker/브라우저/원본 한글 동치 검사는 아닙니다.

최종 집중15/15·exit0(root1+실제14선언)은 후보 세션 명령 전체 할당 실패의 최초/기존 override 원자성, 정식 native history 저장 바이트 undo/redo·no-op·예산 rollback·잘못된 문자/범위·두 번째 배치 요청의 늦은 실패 후 원문/redo 보존을 포함합니다. fmt/diff check도 통과했습니다. 새 작업 트리 ReleaseSafe 빌드를 별도로 시작했으며 아직 완료 gate로 계수하지 않습니다. 이 기록은 새 JS API/Worker/브라우저 지원이나 참조 입력 재계산/재열기 상태 판별 완료가 아닙니다.

표시 연결 후속 상태: 기존 문단 텍스트 snapshot은 저장본의 현재 문자열을 이미 읽고 있었으며 수식 current/서식 snapshot/서식 거래의 현재 값 준비/필드 바깥 좌표 준비에도 같은 override 저장소를 전달했습니다. current 수식의 values는 유효 표시용 transient Command/LastResult이고 원본 source 조회/저장된 cache와 구분합니다. 수동 결과의 표시용 Command를 저장 파라미터에 다시 쓰지 않습니다. 공개 JSON 필드 집합은 변경하지 않았고 수동 결과 설정 공개 명령은 아직 없습니다.

실제 chart의 수동 Unicode/기호 결과에 대해 문단 텍스트·current 수식 및6UTF-16단위의 서식 끝 위치 일치, 다른12결과 불변, source LastResult67.5 보존 및 조회 후 저장 바이트 불변을 확인했습니다. 작은 fixture current snapshot의 전체 할당 실패도 live override를 보존했습니다. 최종 집중13/13·exit0(root1+실제12선언), fmt/diff check가 통과했습니다. 재열기에서 수동 상태를 재구성하는 정책·참조 수정 시 재계산·구조/공개 명령/브라우저/UI 및 최종 전체 gate는 남습니다.

표시 연결 전 저장 snapshot의 작업 트리 ReleaseSafe 빌드는6/6·exit0(43초), WASM SHA256 `171fea9e8a086f555877383f3626b8e3c3deb66b84cd525e73d732181fec7687`입니다. 이 후보의 기존 공개 정의/정확 숫자/text SUM/대기 숫자 이력4파일7/7·exit0·skip0(34865.52175ms)을 확인했습니다. 공개 수동 결과 설정 검사가 아니며 이후 표시 연결 소스를 이 artifact에 소급하지 않습니다. 다른 기존 작업 트리 변경을 포함한 후보이고 기본 데모 WASM을 교체하지 않았습니다.

복수 결과 후속 수정: 실제 copay 참조의 두 번째 결과만 변경하는 초기 native 검사는 실패했습니다. 기대 구역 XML682027바이트와 출력682029바이트가 달랐고 첫 차이62996은 무관한 첫 수식의 dirty0→1이었습니다. override가 있으면 원문 보존 경로를 건너뛰고 일반 준비 결과를 전부 직렬화하던 것이 원인입니다. 숫자/정의/dirty/text site 원문이 변경되지 않은 수동 편집에서는 공통 준비로 선택·의존성을 검증한 뒤 `preserve_parameters` 수동 필드만 공통 writer에 넘기도록 수정했습니다. 무관한 준비값을 비교에서 빼는 검사기 완화가 아니라 출력 대상 선택을 고친 것입니다. 다른 수식이 override에 의존하는 미지원 경로는 준비 단계에서 여전히 거부합니다.

최종 집중 ReleaseSafe11/11·exit0(root1+실제10선언)에서 실제 copay의 나머지 원문 보존, chart13개 override의 단일 ZIP 저장·구역 기대 바이트/원문·수정본 checkpoint 복원, 마지막 요청의 범위 밖 주소/중복 주소 거부 뒤 정확한 수정본 재저장, 앞선 전체 할당 실패·선택·인코딩·예산 검사를 확인했습니다. 현재 실행의 참조 파일 skip은0이지만 copay가 없는 checkout에서는 해당 선언이 명시적으로 skip됩니다. fmt/diff check도 통과했습니다. 후속 작업 트리 ReleaseSafe 빌드를 별도로 실행 중이며 아직 결과/산출물 검증으로 계수하지 않습니다. runtime은 미커밋이고 공개 명령·표시·참조 수정 시 해제·구조/UI 및 최종 전체 gate는 여전히 필요합니다.

`formula_result_override_save`는 요청 구역/FORMULA 노드와 공통 field linker의 실제 begin/end 범위를 확인하고, 선택 정책에서 비활성인 필드를 거부합니다. 기존 `formula_result_sites`의 UTF-8/4096바이트/단일 문단·지원 구조 검사를 재사용하며, 일시적인 borrowed Sites로 공통 `text_sites_save`를 호출합니다. 반환 XML만 소유하고 입력 Tree/Sites를 변경하지 않습니다. Command·Formula·LastResult·dirty 속성을 수정하지 않습니다. 이 정책은 수동 본문 결과와 계산 파라미터를 분리하는 내부 직렬화 단계이며, 원본 한글이 직접 편집을 기록하는 모든 상태/속성의 재현은 아직 입증하지 않았습니다. 변경된 다중 텍스트 조각의 배치는 기존 result-sites 정책을 따르므로 사용자 선택 범위와 세부 서식 편집을 대신하지 않습니다.

최종 ReleaseSafe 집중 실행은 root import 선언을 포함5/5·exit0이며 실제 검증 선언4개입니다. 합성 원문의 결과 외 모든 바이트 보존과 전체 할당 실패, 구역/노드/UTF-8/XML 문자/길이·출력 예산 거부, 실제 chart13필드 각각의 정확한 대상 텍스트 바이트 교체 및 입력 보존, 비활성 run-switch 분기 거부를 검사했습니다. fmt check도 통과했습니다.

최초 분기 반례는 switch를 run 밖에 놓아 공통 선택기의 실제 지원 범위를 검사하지 못했고 예상 오류 대신 성공했습니다. 이때 expectError가 예상 밖 반환 버퍼를 정리하지 않아 테스트 누수도 발생했습니다. 반례를 run 안에 배치하고 예상 밖 성공 버퍼를 명시적으로 정리한 최종 재실행이 통과했습니다. 최초 실패를 제품의 비활성 분기 쓰기 성공이나 최종 통과로 혼동하지 않습니다.

다음 구현은 직접 수정값의 세션 소유/clone·실패 원자성, 저장과 표시 연결, 참조 숫자/정의 변경 시 override 해제·재계산, undo/redo 및 재열기 정책, 보호된 결과 범위의 공개 명령과 UI 연결입니다. 실제 독립 ZIP/XML oracle, 브라우저, 최종 전체 native/build gate는 별도로 필요합니다.

후속 `formula_result_override_values`는 필드 begin별 소유 문자열의 set/get/clear/deep clone을 구현합니다. FORMULA 소유 노드·UTF-8·XML 문자·공통 result-sites의 표시 한도를 확인한 뒤 할당 완료 전에는 기존 값을 해제하지 않습니다. 같은 값은 no-op이고 빈 문자열 override와 항목 부재는 별개입니다. 원본 LastResult/본문을 비교해 자동으로 override를 지우지 않으며 세션 거래가 해제 시점을 결정해야 합니다. 개별 저장소 set은 활성 분기/범위 편집 권한을 부여하지 않습니다. 실제 직렬화 writer의 별도 검사가 필요합니다.

최종 집중 ReleaseSafe7/7·exit0은 root import 선언1개와 실제 검증6개이며 앞선 writer4개 및 소유 저장소2개를 포함합니다. deep clone·교체/해제 전체 할당 실패, 실패 시 기존 값 보존, 자기 문자열 일부를 넘기는 alias 교체, 빈 값 및 잘못된 노드/인코딩/문자/길이 거부를 확인했습니다. fmt/diff check도 통과했습니다. 새 저장소와 공통 표시 한도 상수는 미커밋 runtime이며 세션·checkpoint·표시·재계산·UI에 아직 연결하지 않았습니다.

후속 작업 트리에서는 Section의 소유 필드/해제와 checkpoint State의 deep clone·해제·교환 및 capacity/문자열 메모리 예산에 연결했습니다. 전용 checkpoint 테스트는 작은 실제 HWPX ZIP을 열어 내부 저장소를 직접 설정합니다. capture 전체 할당 실패·복사본 변경 시 원본 값 불변·정확한 예산 증가·limit-1 거부·양방향 exchange·예산 초과 exchange의 현재 값 보존·다른 source rollback 거부·원래 빈 상태 rollback을 확인했습니다. 새 상태는 아직 공개 명령/저장/표시/재계산에서 사용하지 않으며 UI 지원으로 계산하지 않습니다.

최종 집중 ReleaseSafe9/9·exit0은 root import1·기존 수식 정의 checkpoint1·수동 결과7검증을 포함합니다. fmt/diff check도 통과했습니다. 이 최신 snapshot은 이미 실행 중인 이전 전체 native gate와 다르며 runtime 미커밋 상태입니다. 구조 편집/rebase 등 다른 소유 이전 경로, 새 상태의 최종 전체 gate와 공개 저장/이력은 아직 감사해야 합니다.

내부 flat 저장의 후속 구현은 준비된 수동 필드의 `preserve_parameters` 표식으로 결과 text site만 출력하며 파라미터/자동 dirty 교체를 생략합니다. 원문 무변경 저장 빠른 경로는 override가 없을 때만 허용하고, 활성/실제 FORMULA 선택에 없는 override는 거부합니다. 같은 필드의 정의 변경과 override는 충돌 오류이며 구조 모델은 UnsupportedStructuralFormulaResultOverride, 다른 계산의 수동 결과 의존성은 UnsupportedFormulaResultDependency로 명시적으로 거부합니다. 이 임시 거부는 최종 지원 범위를 축소하는 결정이 아니라 아직 구현/검증하지 않은 경로의 손실 방지 경계입니다.

작은 HWPX ZIP의 내부 override 설정→저장/재열기에서 본문 Unicode/기호가 보존되고 Formula/Command/LastResult는 원문 값인 것을 확인했습니다. 재열기 무편집 저장·checkpoint 원문/수정본 양방향 바이트 복원·저장 전체 할당 실패·정의 충돌의 상태 보존을 포함한 최종 집중9/9·exit0(root1+실제8선언), fmt/diff check를 확인했습니다. 이 결과는 공개 history 명령·derived 화면이나 실제 다중 필드 참조 문서 전체 XML/ZIP 독립 대조가 아닙니다. 다른 원본 stale 결과의 불필요한 재계산 보존, 복수 override, 참조 입력/정의 수정 시 해제, 표시/재열기 수동 상태 재구성·구조/rebase/생성 표 및 실제 UI는 여전히 감사·구현 대상입니다.
