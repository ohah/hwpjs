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

## 다음 연결의 완료 조건

입력 거래에서 계획을 원자적으로 검증하고, 보호 범위의 직접/경계/교차 입력은 원본과 이력을 보존하며 거부해야 합니다. 보호 밖의 실제 입력은 독립 전체 Section·비대상 스트림 oracle, 반복 입력·undo/redo·저장 재열기로 검증해야 합니다. 구역 필요조건과 문단별 보호 정보를 함께 native에서 제공하고 기본/구간 UI 모두에 전달하기 전에는 readOnly를 해제하지 않습니다.
