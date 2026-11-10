# 표 삽입 target 가용성

`getTableInsertAvailability(state, target)`는 Core의 불변 상태와 공개 선택 target을 받는 순수 query다. 판별 가능한 `{ allowed, reason, resources }`를 동결해 반환한다. 허용 시 reason은 null이고 resources는 기존 options validator로 검증한 기본 리소스의 복사·동결 값이다. 거부 시 reason은 기존 Core 오류 코드이고 resources는 null이다. Native 요청, 상태 변경, 명령 접수는 하지 않는다.

query와 `tableInsertMessage`는 동일한 내부 target 검사 함수를 사용한다. ready 상태, 이력 복구 필요 여부, 읽기 전용 관측, 선택 token·좌표·소유권·편집 가능 여부, 본문 caret, 기존 원본 문단 참조 guard, 문서 표 생성 capability, 표시 좌표의 원본 좌표 변환을 검사한다. query는 기존 options validator로 사용 가능한 기본 리소스가 있는지도 확인한다. bridge는 이 resources를 그대로 사용하며 정렬·정수·첫 ID 선택 정책을 중복 구현하지 않는다. 실제 크기와 호출자가 지정한 리소스는 dispatch 시 fresh state에서 다시 검증한다. query의 허용 결과는 이후 상태의 명령 권한이나 Native 성공을 보장하지 않는다.

HWP5 generated 문단은 기존 `UnsupportedTableInsertReference`로 거부한다. `original-paragraph-reference.ts`와 Native ABI는 변경하지 않는다. 기존 원본 HWP5 본문과 지원 HWPX 본문의 가용성은 유지한다. generated/current-reference의 안전한 바인딩 확대는 별도 과제다.

데모 bridge는 전달받은 동일 SDK namespace의 명령, 선택 query, 가용성 query를 사용한다. 가용성 API가 없는 이전 SDK는 `TableInsertApiUnavailable`로 닫는다. 원본 참조 거부는 “현재 문단에는 표를 삽입할 수 없습니다. 다른 본문 문단을 선택하세요.”로 표시하여 모달을 열거나 Core 명령을 접수하지 않는다. UI에서 reference kind/id 규칙을 별도로 구현하지 않는다. 기존 capture 소유권, 상태 identity, pending/disposed, 명령 namespace와 await 이후 재검사 및 uncertain 결과 처리는 유지한다.

집중 source 검증은 새 Core 가용성/데모 target 테스트와 기존 표 삽입·uncertain 테스트를 포함한다. 실제 Native에서 얻은 원본/생성 문단 DTO의 재생 결과는 `zig-out/verification/table-insert-target-availability-r1/recorded-dto-replay.json`에 둔다. 재생은 현재 source Core와 bridge의 검사 증거이며 새 Native 실행·브라우저·배포 검증과 구분한다. 기존 실제 실패 및 저장 oracle은 `contextual-table-row-shortcut-r1/core-create-diagnosis/`에 보존한다.


실제 최종 브라우저에서는 같은 세션의 HWP5 생성 문단에서 표 생성 버튼이 Core 접수 전에 비활성화되고, 노출된 정상 오류 경로·Native 저장 bytes가 바뀌지 않으며 본문 입력과 undo가 복구됨을 확인했습니다. API 플레이그라운드는 두 형식의 실제 선택 발급기로 body owner를 확인한 허용 반환과 표 셀 owner의 거부 반환을 각각 실행했습니다. 허용 값은 네 정수 리소스를 포함하며 query 전후 상태·Native 이력·저장 bytes가 같습니다. 긍정 사례를 첫 비어 있지 않은 셀로 대신하지 않았고 위치 선택 과정도 기록했습니다. 범위와 최종 pin은 `contextual-table-row-shortcut-r1/browser/final-accepted.json`을 따릅니다. npm 게시는 포함하지 않습니다.
