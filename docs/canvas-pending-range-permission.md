# 응답 대기 초안과 native 범위 권한

## 책임과 변경

초안 수집과 문서 변경 허가를 구분합니다. Canvas의 pendingDraftEditable은 이미 진행 중인 텍스트 요청이나 그에 종속된 의도 큐가 있고 현재 소유 문단이 선택 가능할 때에만 DOM 초안을 계속 수집합니다. 초기 미허가 선택·다중 문단·이력/구조 요청을 이 경로로 허용하지 않습니다. 실제 pump의 textEditable/native 범위 허가 조건은 그대로 유지합니다. 초안에 들어간 보호 위치는 권한 거부 시 종속 의도와 함께 폐기하고 이미 native가 반영한 committed 값으로 복원합니다.

updateReadOnly는 실제 전송할 수 있을 때만 범위/분할 조회를 permission cache에 등록합니다. query callback이 명시적으로 false를 반환하면 미전송 요청을 invalidate합니다. sequence/식별/범위/boolean/거부 판정은 기존 selection-edit-permission.mjs가 계속 소유합니다. DOM 초안 허용을 native 문서 권한이나 새로운 편집 모델로 바꾸지 않습니다.

## 재현

issue144-fields-crossing-lineseg-boundary.hwpx에 생성 표를 설치하고 선택적 hwpx_edit_created_table_field_label_mode export만 제거한 호환성 profile에서, 다음 대기 입력의 query-edit-range를 기다리는 동안 textarea가 readOnly=true로 바뀌었습니다(수정 전 focused exit1,366.400583ms). 이것은 실제 원본에서 생성한 표 파생본과 명시적 ABI 부재 대역이며 최신 후보가 본래 해당 export를 제공하지 않는다는 뜻이 아닙니다. 최초 원본 문단을 editable=false로 가정한 시도는 실제 editable=true로 중단했으며 제품 오류로 계수하지 않습니다.

초안 버퍼링 수정 뒤 undo/선택 복원 부정 대조에서 전송되지 않은 permission request가 캐시에 남아 새 입력0을 막았습니다. 다른 query로 controls.busy=true인 상태에서 request를 생성하고 callback의 false를 무시하던 것이 원인입니다. 전송 가능 조건과 실패 정리를 추가한 뒤 같은 재현이 통과했습니다.

## 검증 경계

field-input-queue.test.mjs의 실제 Worker/WASM·DOM 대역은 미허가 native splice0회,권한 확인 뒤0→1→0의 순서,독립 전체 XML/ZIP(Python 일반/-O),원문 undo와 보호 위치12의 초안 폐기/미제출을 확인합니다. 별도 실제 HWP5/HWPX hyperlink 원본은 라벨 안의 세 연속 입력과 각 undo/redo·저장·재열기를 검사합니다. HWP5는 독립 전체 구역/비대상 CFB stream, HWPX는 독립 전체 XML/ZIP과 fieldBegin 소유 ID를 대조합니다. HWP5 시작 표식 삭제·HWPX 필드 경계를 가로지르는 삭제는 native 거부와 이전 저장본 불변을 함께 확인합니다.

공유 HWP5 field-span-oracle.mjs는 제품 좌표를 읽지 않고 레코드/논리 리스트/UTF-16 표식을 연결합니다. 실제 hyperlink4필드 중 첫 내용 범위24..33과 위조 헤더/종료 ID 거부를 별도 검사했습니다. 게시하지 않은 공개 fieldSpans API를 사용하는 이전 비교 파일은 분리 검증에서 editor.fieldSpans is not a function으로 실패했으므로 이 게시 단위의 native API 완료 증거로 세지 않습니다.

이 작업은 DOM 대역/ABI 부재 호환성 profile·명시한 두 원본의 검증입니다. 브라우저 event timing·OS IME·모든 필드/구조 권한 완료 또는 기본 WASM 승격은 별도입니다.

## 실행 결과

후속 회귀는 권한 query가 pending인 상태에서 조합 시작·중간 `ㄱ`·권한 응답·최종 `가` 종료를 교차시킵니다. 중간 native splice0회,최종0→1→0,보호 위치12의 조합이 거부된 뒤 늦은 compositionend가 native 편집을 재제출하지 않는 것을 확인했습니다. 일반 입력과 조합 입력 profile을 따로 실행하며 ABI 부재 대역을 정상 기본 산출물과 혼동하지 않습니다.

실제 Worker가 계산한 옛 query reply를 harness.flush(false)로 DOM에 전달하지 않고 보관했습니다. 새 load와 표 생성 뒤 같은 문단/좌표의 새 요청이 pending인 상태에서 옛 allowed=true 응답을 직접 전달해도 readOnly=true/초기 beforeinput 방지가 유지됐고 native 저장은 새 baseline과 byte-exact였습니다. 증가한 requestId의 새 응답 뒤에만 입력이 허용됐습니다. flush의 기본 publish=true 동작은 유지하며 별도 문서 모델이나 제품 이벤트 분기를 추가하지 않았습니다.

이 두 후속 경로를 포함한 같은8파일은62/62·skip0·exit0(12609.071666ms),동일한 controller(cmp 일치)의 분리 게시3파일은21/21·skip0·exit0(9797.17275ms)입니다. 이 추가 검증에서 새 제품 코드 변경은 없었으며, 실제 브라우저/OS IME/모든 문서 동치의 증거로 확대하지 않습니다.

cb5d1b87 WASM 후보와 현재 JS의 실제8파일 선택은60/60·skip0·exit0(12249.091667ms)입니다. field-input-queue/control-offset-input-queue/text-input-selection-worker/table-creation-worker/selection-edit-permission/canvas-edit/input-intent-queue/text-input-selection을 실행했습니다. 분리 게시 JS에 controller의 이번 차이·새 field 입력 회귀·공유 독립 oracle·permission pure 회귀만 추가한 실제3파일 선택은19/19·skip0·exit0(9937.214459ms)입니다. 이전4파일 시도의 미게시 fieldSpans API 실패를 통과로 바꾸거나 두 실행 개수를 합산하지 않습니다. 기본 WASM·native 본체 변경은 게시 단위에 포함하지 않습니다.
