# 셀 나누기 대화상자 UI 계약

이 후보는 기존 셀 나누기 명령의 UI만 다듬는다. `table-cell-split-tool.ts`는 기존
`createDialogLayer`를 소비하고 전용 CSS는 해당 대화상자 아래로 한정한다.
Native, Core 명령, 분할 admission, 수치 단위 또는 저장 모델을 수정하지 않는다.

## 관측과 참고 범위

H 합본의 제공된 실제 dialog.png에는 기본 HTML 버튼, 검은 3px dialog 테두리,
줄/칸 입력의 붙은 레이블이 관측되었다. 이번 후보는 프로젝트 공통 제목 표시줄,
1px 테두리, 버튼, 포커스 표시, 모달 Tab 순환을 재사용한다. 줄/칸 입력과 나누기
방법은 fieldset/legend로 묶고, 360px 이하에서는 입력을 한 열로 배치한다.
내용 영역은 스크롤하고 하단 동작 버튼은 별도로 배치한다.

공식 도움말의 줄/칸 수, 균등 높이, 합친 뒤 나누기 구성을 참고했다.

- [웹한글 셀 나누기 도움말](https://webhwpctrl.cloud.hancom.com/webhwpctrl/js/rights/table/table(divide).htm)
- [한컴오피스 셀 나누기 도움말](https://help.hancom.com/hoffice130/ko-KR/Hwp/table/table(divide).htm)

공식 제품의 실시간 모달 픽셀/키보드 동작을 관측한 증거는 없다. 이 후보의 외형과
행동 검증은 자체 제품의 실제 브라우저 결과이며, 공식 제품과 행동 동치나 픽셀
동치를 주장하지 않는다. 공식 자산이나 비공식 역공학 구현을 사용하지 않는다.

## 유지하는 입력 및 지원 제한

- 기본값 줄 1/칸 2, 정수 1~63, 1은 해당 방향 유지라는 Native 계약을 유지한다.
  공식 도움말의 분할 방향 2~63과 혼동하여 1 sentinel을 제거하지 않는다.
- 기존 `each`/`merge-then-split` 값, `equalizeRows` 값과 선택 capture를 그대로 전달한다.
- HWP5는 원본 비병합 표의 단일 셀 균등 분할만 지원한다. 합친 뒤 나누기와
  균등 높이 해제는 비활성 상태로 유지한다. 병합/여러 셀/복잡한 구조는 후속이다.
- 기존 HWPX 지원 intent를 UI가 축소하지 않는다. 이 후보는 지원 범위를 넓히지 않는다.
- 기존 제한/거부 이유 문구를 보존한다. 모달이 이미 열렸거나 tool이 dispose되면 열지 않는다.

## 포커스와 비동기 수명

열 때 칸 수에 포커스한다. 공통 레이어가 Escape, Tab/Shift+Tab 순환, 제목 표시줄
이동을 처리한다. 모달 안의 F5는 페이지 새로고침이나 뒤쪽 셀 선택으로 전달하지 않는다.
취소/닫기는 연결된 동일 editor/document/generation의 현재 host에만 focus를 요청한다.
다른 문서나 교체된 host에 포커스를 빼앗지 않는다.

명령 실행 중 입력·선택·닫기 버튼을 잠그고 Escape는 닫지 않는다. 거부 후 원래
비활성 intent를 복원한다. stale capture는 dispatch하지 않는다. dispose 이후 성공
응답은 UI나 상태 메시지를 갱신하지 않는다. 브라우저 native cancel도 공통 레이어를 따른다.

실제 H 엔진의 분할 성공 직후에는 캐럿이 비고 Canvas가 포커스를 받는다. 이번 UI는
임의의 새 셀 주소/캐럿을 합성하지 않는다. 취소 뒤에는 문서 입력으로 돌아가며 방향키로
실제 셀 블록 이동이 가능하다. 성공 뒤 새 셀로 직접 타이핑 복귀는 별도 Surface/명령
선택 복구 계약의 후속이며 이번 후보의 완료 주장에 포함하지 않는다.

## 검증 구분

`apps/demo/tests/table-cell-split-dialog.contract.ts`는 실제 DOM + 제어된 API double로
기존 모달, busy/Escape, stale, 다른 문서, dispose 후 응답, HWPX intent 보존을 검사한다.
이는 Native 저장 증거가 아니다.

`apps/demo/tests/table-cell-split-dialog-browser.mjs`는 실제 공개 Vanilla/React/Svelte
mount와 Worker/Native를 사용한다. pointer+F5, context/표 메뉴, 모달 F5, 실제 Tab 순환,
취소/Escape 포커스, 취소 후 방향키 셀 이동, 잘못된 수치, desktop/320px 반응형,
적용 후 Canvas 포커스, HWP5 저장·단일 undo/redo·재열기를 검사한다. 외부 지정된
고정 SHA의 독립 CFB oracle을 normal 및 Python -O로 실행한다. fixture/oracle/site/out은
환경 변수로 명시하고 각 child 시작 전 statfs 8GiB, finally로 소유 browser/server를 닫는다.

실제 HWPX 저장 regression을 새로 실행했다는 주장은 하지 않는다. HWPX intent는 UI
계약에서 검증했고 Native/HWPX writer는 동결 상태다. 배포·Main 통합 결과와도 구분한다.
