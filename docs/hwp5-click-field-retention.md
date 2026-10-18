# 미닫힘 누름틀 필드의 원본 보존 계획

## 현재 범위

click_field_retention.read는 미닫힘 %clk가 있는 구역의 원본 헤더를 검증하고 보호 문단 배열을 계산하는 native 코어입니다. 보호 밖의 일반 텍스트 입력을 원자적 splice·공개 추가 보호 조회·Canvas에 연결했습니다. protected_paragraphs=false는 텍스트 범위/제어 경계 검증이나 편집 허가를 대신하지 않습니다. 보호 범위·혼합 필드·구조 변경·서식 편집 지원을 확대한 것으로 해석하지 않습니다.

기존 엄격 field_bindings와 이 계획은 공통 field_header_source의 헤더 개수·ordinal·ID/관측 alias·properties 해석을 사용합니다. 기존 필드별 parser를 복제하지 않습니다. 엄격 collector의 문단별 선언 개수와 중복 source node 검사도 유지합니다. 공통 조회는 범위를 벗어난 source node와 비문단 노드를 SourceBindingMismatch로 거부합니다.

계획은 기존 source_policy의 텍스트 거래 보존 검사를 먼저 사용합니다. 원본 토폴로지의 닫힌 쌍과 미닫힘 시작을 동일 source header에 연결하고, 모든 문단의 실제 field header 수와 대조합니다. 현재 지원 계획은 모든 필드가 %clk이고 짝 불명 표식이 unclosed_start인 경우에 한정합니다. 다른 종류/고아 종료/미지 시작/위조 소속은 거부합니다. generated 문단도 아직 허용하지 않습니다.

닫힌 필드는 확인된 범위에 속하는 같은 native 논리 소속의 문단을 보호합니다. 미닫힘 시작은 종료 위치를 만들지 않고 해당 논리 리스트 전체를 보호합니다. 다른 셀이나 interleaved 리스트는 섞지 않습니다. 요청/거래마다 생성하는 owned bool 배열이며 Plan.deinit으로 해제하고 편집값의 영속 cache로 보관하지 않습니다.

## 검증

실제 issue1921/59043_regulatory_analysis.hwp의 헤더29개를 모두 연결하고 미닫힘 셀 문단52가 보호되는지 확인했습니다. 문단0의 보호 배열 false는 단독 입력 허가가 아니며 아래 실제 거래 검증과 구분합니다. 전체 부분 할당 실패와 해제, 위조 parent, 시작 종류 변조(%bmk/미지), 고아 종료로 바꾼 marker를 검사합니다. 별도 원본의 헤더 범위/ordinal/ID 위조 및 기존 mixed/배포 필드 바인딩·토폴로지 반례도 함께 실행했습니다.

분리 소스 /tmp/hwpjs-click-retention.Vm3dFy에서 ReleaseSafe/Debug 각각9/9·실패/건너뜀0입니다(retention-safe-final-corrected.log·retention-debug-final.log). 최초 추가 반례 컴파일은 디스크 공간 부족으로 실패했고 성공 통계에 포함하지 않았습니다. 기존 API 집중9파일21/21·실패/취소/건너뜀0입니다(header-api-focused.log).

ReleaseSafe 제품 빌드는5/5단계 성공, 후보 SHA-256은703fc80b76b96c4644733b27e27f908437d9e70f8b9e2549d245246cf181ca8b입니다. 이전8e087670 후보의333개 export 이름/kind를 모두 유지하며 추가/누락은 없습니다. 이름/kind 대조는 signature/전체 동작 동치의 증거가 아니며 실제 바인딩·원본/이력/구형 ABI 회귀는 위21개로 구분합니다. 이번 후보의 전체 native/편집 묶음·브라우저·기본 데모 승격을 주장하지 않습니다.

## 원자적 비공개 준비 단계

click_field_retained_splice.prepare는 model.transaction의 private draft 안에서만 사용합니다. 원본 계획이 보호한 문단은 거부하고 기존 plain.applyFieldTransaction으로 목표 문단만 준비합니다. 준비 후 보호 배열/바인딩 헤더 수를 다시 확인하고, 비대상 문단은 공통 model.equality.paragraph로 전체 값이 동일한지 검사합니다. 새 문단 비교 함수는 기존 equality 내부 구현을 재사용합니다. 호출자가 수행하는 allocation-free commit 경계는 기존 transaction 그대로입니다.

초기 helper 검증 당시 실제 세션 splice의 fallback과 UI 허가는 분리해 두었습니다. 이 helper의 정규 테스트는 작은 decoded-section fixture와 명시적인 transaction 어댑터를 사용합니다. 합성 구역은 완전한 HWP 컨테이너가 아니며 실제 파일 지원 근거와 구분합니다. 전체 부분 할당 실패의 원본 불변/해제, 미닫힘 소속 거부, SplitControlToken·UnsupportedControlDeletion·InvalidTextPosition·UnsupportedTextControl을 검사했습니다. ReleaseSafe/Debug 각각 root 포함3/3·실패/건너뜀0입니다(prepared-final-safe-corrected.log·prepared-final-debug.log).

## 실제 문서의 격리 입력 실험

같은 임시 소스에만 strict binding의 UnsupportedCrossParagraphField 뒤 위 준비 단계를 호출하는 분기를 넣었습니다. 게시 소스의 분기와 기본 정책은 바꾸지 않았습니다. 동결 baseline703fc80b는 실제 미닫힘 문서의 문단0 입력을 여전히 거부합니다. 실험 후보01b07d2286b26142530be61b5cb48b1c96510fa42ba8233b0958cfcaae06f047은 같은 문서 문단0에 보존😀를 삽입하고 독립 CFB.js/Node oracle의 전체 Section·모든 비대상 스트림 대조, undo/redo, 저장 재열기를 통과했습니다. 미닫힘 문단52와 기존 필드 문단의 입력 거부 뒤 원본/대기 redo도 유지됐습니다. 재열기 뒤 source list node ID가 바뀔 수 있으므로 의미 좌표와 원시 표식은 비교하되 원본별 노드 번호를 억지로 동일하게 취급하지 않습니다.

실험 build는5/5단계 성공, prototype-retained-edit.log의 baseline/후보2/2·실패/건너뜀0입니다. 최초 빌드는 비교 helper의 공개 여부를 잘못 가정해 실패했고 명시적 paragraph 비교를 추가해 재실행했습니다. 합성 준비 테스트도 새 텍스트 토큰이 X만 담는다고 가정한 것과 개행 대신 문자 역슬래시/n을 넣은 검사 입력을 고친 뒤 통과했습니다. 실패한 실행은 성공에 합산하지 않았습니다.

실험 소스·baseline-703fc80b.wasm·후보·로그는 /tmp/hwpjs-click-retention.Vm3dFy에 있습니다. 실험 후보에서도 기존 validateTextSourcePolicy는 보수적으로 거부하며, 기본/구간 UI를 열거나 배포하지 않았습니다. 이 결과는 native 준비 경로의 실제 저장 가능성을 확인한 것이며 문서 전체 필드 편집·조판 동치·완성된 공개 편집 기능을 뜻하지 않습니다.

## 공개 추가 보호와 입력 연결

기존 validateTextSourcePolicy는 전체 원본의 보수적 엄격 검사로 유지합니다. 새 textSourceProtection(section)은 추가 보호 정보이며 mode(strict/retained_click), protected_paragraphs(현재 문단 수의 bool 배열), retained_headers(strict는 null, retained_click은 연결 수)를 반환합니다. false bit 자체는 입력 허가가 아닙니다. supportsTextSourceProtection으로 optional ABI를 확인하며 부재는 Hwp5TextSourceProtectionAbiUnavailable입니다. native hwp5_edit_text_source_protection은 기존 output/error 채널을 사용하고 조회는 source/model/이력을 바꾸지 않습니다.

선택/비선택 원본 검사는 text_source_policy에서 공유합니다. 새 조회는 비선택 구역 오류를 먼저 전파하고 선택 구역의 정확한 UnsupportedCrossParagraphField만 검증된 click 보존 계획으로 처리합니다. 형식/ID/OOM 등 다른 오류를 복구하지 않습니다. getter의 배열 길이는 JS가 native 현재 문단 수와 대조하며 sparse/비bool/모드·개수 불일치를 거부합니다. 생성 문단이 있는 strict 조회의 현재 개수와 undo/redo도 검사했습니다.

field_splice의 기존 atomic draft에서 엄격 바인딩이 같은 오류를 낸 경우에만 준비 helper를 사용합니다. 보호 문단은 거부하고 목표 문단 밖의 전체 값·보호 배열·헤더 연결 수가 그대로인지 확인한 뒤 기존 transaction이 commit합니다. 과거의 전체 원본 엄격 검사가 부정적이어도 새 경로가 검증한 보호 밖 입력은 가능하므로 엄격 조회 결과를 모든 경로의 필요충분 조건으로 취급하지 않습니다.

UI는 기존 엄격 조회를 우선하고 동일 오류일 때만 새 native 보호 배열을 응답 내 구역별1회 조회합니다. 보호 밖 창 후보 복원은 같은 projection이 보류해 둔 원래 editable 후보에만 허용합니다. context/잘린 문단/기존 비편집 후보를 승격하지 않습니다. 보호 문단과 invalid map/OOM/일반 오류는 닫습니다. JS는 field marker의 의미나 범위를 다시 계산하지 않습니다. 구간 경고는 전체 구역 대신 보호 범위 읽기 전용을 명시합니다. 구형 WASM의 부재/거부는 기존 보수적 동작을 유지합니다.

후보 c80e49ca5112be3c9704e6508fbfa5f76301d367a88e95530e8336ca96a17845는 ReleaseSafe 제품5/5단계 성공입니다. 기존333 export를 유지하고 optional 추가 보호 조회1개만 더한334개입니다. native 조회의 전체 부분 할당 실패·다른 구역 미해결/미지원 거부는 Safe/Debug 각각 root 포함3/3입니다. 확대 집중20파일48/48·실패/취소/건너뜀0(protection-broad.log)이며 새 조회/생성 문단 개수/기존 ABI/정책 오류/실제 배포용·보정본·저장 구역 보기·HWPX 시작 경계를 포함합니다.

실제 Chromium에서 같은 원본을 업로드하고 문단0 구간을 찾기로 선택해 trusted beforeinput/input으로 브라우저보존😀를 넣었습니다. source UTF-16 범위0..0을 확인했고 undo/redo·실제 다운로드의 독립 전체 Section/비대상 스트림 oracle이 통과했습니다. 문단52 구간으로 옮긴 뒤 입력 닫힘/보호 범위 경고도 확인했습니다. 세션 hwpjs-retained-input-22e42984d26e와 임시 서버 포트58855 종료를 확인했습니다. 스킬의 trusted 클릭/입력 원점·종료 확인 규칙을 사용했습니다.

근거는 같은 임시 소스의 protection-native-safe.log·protection-native-debug.log·protection-api.log·protection-integrated.log·protection-broad.log·retained-browser.log, 사진/다운로드는 retained-ui-yO9dlE입니다. 화면에는 UnsupportedInlineTableHost/IncompleteHwp5WindowTables에 따른 논리 미리보기 제한이 남아 있습니다. 한 원본의 실제 텍스트 입력 검증이며 전체 필드·서식·원본 조판·OS IME·기본 데모 승격 완료가 아닙니다.

## 원본이 정상인 모델 손상 반례

보존 경로는 현재 모델의 UnsupportedCrossParagraphField만 보고 허용하지 않습니다. immutable 원본의 공통 validateSelected도 정확히 같은 오류여야 하며 정상 원본이나 다른 오류는 복구하지 않습니다. 닫힌 %clk 원본을 먼저 엄격 검증한 뒤 현재 모델에서 종료 토큰만 없애는 반례로 거부·원자적 모델 불변을 확인했습니다. 기존 원본 미닫힘의 보호 밖 입력과 전체 부분 할당 실패 검사는 유지합니다.

187e8c44의 src만 별도 /tmp/hwpjs-retained-negative.egB2nv에 추출해 위 원본 검사만 제거한 음성 대조를 실행했습니다. ReleaseSafe 컴파일 후 반례가 expected error.UnsupportedCrossParagraphField, found void로 실패해 실제 잘못된 성공을 검출했습니다(2개 중1개 실패, exit1, original-source-guard-negative-retry.log). 같은 복사본의 검사만 원상 복원하자 root 포함2/2·skip0·exit0이었습니다(original-source-guard-restored.log). 복원 helper는 제품 후보와 바이트 일치합니다. 최초 original-source-guard-negative.log는 NoSpaceLeft 컴파일 실패여서 음성 대조 성공으로 세지 않습니다. 제품/활성 검증 소스는 변경하지 않았습니다.

이 보강을 포함한 후보는 6ddc76ab71dc09a77acf0b57b7ec78b2cc137850189e136fb361edd5d71d0437이며 ReleaseSafe 제품 빌드5/5, native 집중 Safe/Debug 각각6/6입니다. protection-counter-safe.log·protection-counter-debug.log·protection-counter-build.log가 근거입니다. 이전 c80 후보와 보강 후보 각각 읽기 전수975개는 응답 동일944·동일 거부5·HWP3 제외26이었습니다. 보강 후보의 protection-counter-reader.jsonl은 baseline703→6dd 전체 JSON/원본 불변 결과이며 쓰기 지원 성공으로 세지 않습니다. 정규 editor gate는 protection-counter-editor-full.log에서 실행 중이고 전체 통과로 표기하지 않습니다. 기존 native4096 실행은 이 보강 이전 별도 산출물이므로 최신 main 전체 native 통과 근거도 아닙니다.

같은 보강 후보의 API/Worker 경계17파일43/43(실패/취소/건너뜀0, protection-counter-node.log)이 통과했습니다. 별도 retained-click-roundtrip.test.mjs는 같은 실제 원본에서 삽입→교체→삭제 각각 독립 Section/비대상 스트림 oracle, surrogate 중간 삽입 거부, 보호 거부 뒤 pending redo, 저장 재열기 뒤 재편집·보호 배열/필드 의미 보존을 확인했습니다(1/1, protection-repeat-roundtrip.log). 정규 editor gate에도 등록합니다. 이미 실행 중인 전체 gate에는 이 추가1개가 포함되지 않으므로 집중1개를 전체 결과에 합산하지 않습니다.

위 최초 정규 gate(protection-counter-editor-full.log)는 개별 테스트 실패/최종 Node·Build summary를 남기지 않은 채 실행 handle8613이exit1로 종료했습니다. 완료 통과로 합산하지 않으며 실패 원인은 아직 확정하지 않았습니다. 종료를 확인한 뒤 추가 roundtrip1개도 등록한 같은 제품으로 정규 gate를 재실행했습니다(handle25652). run-editor-gate.mjs가 child 종료 code/signal·30초별 남은 공간을 protection-editor-supervised.jsonl에, stdout/stderr를 각각 protection-editor-supervised.stdout/.stderr에 별도 수집합니다. 재실행은477/477·실패/취소/건너뜀0·696726.698583ms·빌드7/7·exit0/signalnull로 완료했습니다. source와 WASM은 이 후보에 고정했고 구형 baseline은 별도 기본 cbaaf27f 산출물을 명시했습니다. 이전 실패나 별도 집중 검사를477개에 합산하지 않습니다. 전체 native·기본 데모 승격·임의 위치/필드/원본 조판 완료는 아닙니다.

같은 보강 후보로 실제 Chromium 입력·undo/redo·독립 다운로드 oracle·문단52 보호 입력 거부를 다시 통과했습니다(retained-counter-browser.log, retained-ui-R2TPai). trusted UTF-16 입력 범위0..0과 브라우저/서버 종료를 확인했습니다. 이 검증도 원본 조판이나 OS IME 전체 동치를 뜻하지 않습니다.

## 남은 연결과 완료 조건

현재 확인한 보호 밖 입력을 더 많은 원본·반복 입력·경계 조합으로 확대해야 합니다. 새 범위에서도 원자적 검증, 보호 범위의 거부/이력 불변, 독립 전체 Section·비대상 스트림 oracle·저장 재열기를 유지해야 합니다. 이 필드 자체의 편집·혼합/고아 필드·문단 구조·서식·원본 조판은 별도 미완료 범위입니다.
