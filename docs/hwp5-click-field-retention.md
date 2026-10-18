# 미닫힘 누름틀 필드의 원본 보존 계획

## 현재 범위

click_field_retention.read는 미닫힘 %clk가 있는 구역의 원본 헤더를 검증하고 보호 문단 배열을 계산하는 native 코어입니다. 아직 splice·원본 적격성·공개 ABI·Canvas 입력에 연결하지 않았습니다. protected_paragraphs=false는 텍스트 범위/제어 경계 검증이나 편집 허가를 대신하지 않습니다. 해당 문서의 기본 엄격 편집 거부와 읽기 전용 UI는 유지합니다.

기존 엄격 field_bindings와 이 계획은 공통 field_header_source의 헤더 개수·ordinal·ID/관측 alias·properties 해석을 사용합니다. 기존 필드별 parser를 복제하지 않습니다. 엄격 collector의 문단별 선언 개수와 중복 source node 검사도 유지합니다. 공통 조회는 범위를 벗어난 source node와 비문단 노드를 SourceBindingMismatch로 거부합니다.

계획은 기존 source_policy의 텍스트 거래 보존 검사를 먼저 사용합니다. 원본 토폴로지의 닫힌 쌍과 미닫힘 시작을 동일 source header에 연결하고, 모든 문단의 실제 field header 수와 대조합니다. 현재 지원 계획은 모든 필드가 %clk이고 짝 불명 표식이 unclosed_start인 경우에 한정합니다. 다른 종류/고아 종료/미지 시작/위조 소속은 거부합니다. generated 문단도 아직 허용하지 않습니다.

닫힌 필드는 확인된 범위에 속하는 같은 native 논리 소속의 문단을 보호합니다. 미닫힘 시작은 종료 위치를 만들지 않고 해당 논리 리스트 전체를 보호합니다. 다른 셀이나 interleaved 리스트는 섞지 않습니다. 요청/거래마다 생성하는 owned bool 배열이며 Plan.deinit으로 해제하고 편집값의 영속 cache로 보관하지 않습니다.

## 검증

실제 issue1921/59043_regulatory_analysis.hwp의 헤더29개를 모두 연결하고 미닫힘 셀 문단52가 보호되는지 확인했습니다. 문단0은 이 필드 보호 배열에서는 false이지만 현재 native splice가 허용된다는 뜻은 아닙니다. 전체 부분 할당 실패와 해제, 위조 parent, 시작 종류 변조(%bmk/미지), 고아 종료로 바꾼 marker를 검사합니다. 별도 원본의 헤더 범위/ordinal/ID 위조 및 기존 mixed/배포 필드 바인딩·토폴로지 반례도 함께 실행했습니다.

분리 소스 /tmp/hwpjs-click-retention.Vm3dFy에서 ReleaseSafe/Debug 각각9/9·실패/건너뜀0입니다(retention-safe-final-corrected.log·retention-debug-final.log). 최초 추가 반례 컴파일은 디스크 공간 부족으로 실패했고 성공 통계에 포함하지 않았습니다. 기존 API 집중9파일21/21·실패/취소/건너뜀0입니다(header-api-focused.log).

ReleaseSafe 제품 빌드는5/5단계 성공, 후보 SHA-256은703fc80b76b96c4644733b27e27f908437d9e70f8b9e2549d245246cf181ca8b입니다. 이전8e087670 후보의333개 export 이름/kind를 모두 유지하며 추가/누락은 없습니다. 이름/kind 대조는 signature/전체 동작 동치의 증거가 아니며 실제 바인딩·원본/이력/구형 ABI 회귀는 위21개로 구분합니다. 이번 후보의 전체 native/편집 묶음·브라우저·기본 데모 승격을 주장하지 않습니다.

## 원자적 비공개 준비 단계

click_field_retained_splice.prepare는 model.transaction의 private draft 안에서만 사용합니다. 원본 계획이 보호한 문단은 거부하고 기존 plain.applyFieldTransaction으로 목표 문단만 준비합니다. 준비 후 보호 배열/바인딩 헤더 수를 다시 확인하고, 비대상 문단은 공통 model.equality.paragraph로 전체 값이 동일한지 검사합니다. 새 문단 비교 함수는 기존 equality 내부 구현을 재사용합니다. 호출자가 수행하는 allocation-free commit 경계는 기존 transaction 그대로입니다.

실제 세션 splice의 fallback과 UI 허가는 **아직 게시하지 않았습니다**. 이 helper의 정규 테스트는 작은 decoded-section fixture와 명시적인 transaction 어댑터를 사용합니다. 합성 구역은 완전한 HWP 컨테이너가 아니며 실제 파일 지원 근거와 구분합니다. 전체 부분 할당 실패의 원본 불변/해제, 미닫힘 소속 거부, SplitControlToken·UnsupportedControlDeletion·InvalidTextPosition·UnsupportedTextControl을 검사했습니다. ReleaseSafe/Debug 각각 root 포함3/3·실패/건너뜀0입니다(prepared-final-safe-corrected.log·prepared-final-debug.log).

## 실제 문서의 격리 입력 실험

같은 임시 소스에만 strict binding의 UnsupportedCrossParagraphField 뒤 위 준비 단계를 호출하는 분기를 넣었습니다. 게시 소스의 분기와 기본 정책은 바꾸지 않았습니다. 동결 baseline703fc80b는 실제 미닫힘 문서의 문단0 입력을 여전히 거부합니다. 실험 후보01b07d2286b26142530be61b5cb48b1c96510fa42ba8233b0958cfcaae06f047은 같은 문서 문단0에 보존😀를 삽입하고 독립 CFB.js/Node oracle의 전체 Section·모든 비대상 스트림 대조, undo/redo, 저장 재열기를 통과했습니다. 미닫힘 문단52와 기존 필드 문단의 입력 거부 뒤 원본/대기 redo도 유지됐습니다. 재열기 뒤 source list node ID가 바뀔 수 있으므로 의미 좌표와 원시 표식은 비교하되 원본별 노드 번호를 억지로 동일하게 취급하지 않습니다.

실험 build는5/5단계 성공, prototype-retained-edit.log의 baseline/후보2/2·실패/건너뜀0입니다. 최초 빌드는 비교 helper의 공개 여부를 잘못 가정해 실패했고 명시적 paragraph 비교를 추가해 재실행했습니다. 합성 준비 테스트도 새 텍스트 토큰이 X만 담는다고 가정한 것과 개행 대신 문자 역슬래시/n을 넣은 검사 입력을 고친 뒤 통과했습니다. 실패한 실행은 성공에 합산하지 않았습니다.

실험 소스·baseline-703fc80b.wasm·후보·로그는 /tmp/hwpjs-click-retention.Vm3dFy에 있습니다. 실험 후보에서도 기존 validateTextSourcePolicy는 보수적으로 거부하며, 기본/구간 UI를 열거나 배포하지 않았습니다. 이 결과는 native 준비 경로의 실제 저장 가능성을 확인한 것이며 문서 전체 필드 편집·조판 동치·완성된 공개 편집 기능을 뜻하지 않습니다.

## 다음 연결의 완료 조건

입력 거래에서 계획을 원자적으로 검증하고, 보호 범위의 직접/경계/교차 입력은 원본과 이력을 보존하며 거부해야 합니다. 보호 밖의 실제 입력은 독립 전체 Section·비대상 스트림 oracle, 반복 입력·undo/redo·저장 재열기로 검증해야 합니다. 구역 필요조건과 문단별 보호 정보를 함께 native에서 제공하고 기본/구간 UI 모두에 전달하기 전에는 readOnly를 해제하지 않습니다.
