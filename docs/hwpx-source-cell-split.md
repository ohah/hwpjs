# HWPX 원본 셀 나누기

## 공식 동작과 후보 범위

현재 셀 또는 직사각형 셀 블록에 대해 줄·칸 나누기, 개별 셀 나누기, 합친 후 나누기, 줄 높이 균등 옵션을 제공한다. 원래 내용은 첫 분할 셀에 남는다. 활성 방향의 개수는 2~63이며 SDK와 대화상자는 유지할 방향을 1로 표시한다. 공식 동작은 한컴 도움말과 WebHwpCtrl 안내를 기준으로 한다. [셀 나누기 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/table/table%28divide%29.htm), [WebHwpCtrl 안내](https://forum.developer.hancom.com/t/script/1470)

R3 Native가 검증한 HWPX 원본 BODY 정적 표를 대상으로 한다. 기존 병합 span은 전체 물리 셀을 선택한 경우 허용한다. 생성 표 저장소, 중첩 표, 보호·이름·연결 소유권, 선택 구역의 필드와 지원되지 않는 제어는 Native에서 거절한다. 원본 행 높이를 유지하는 일부 분할도 `UnsupportedSourceTableSplitHeights`로 거절하며 대화상자에 이유를 표시한다.

## Typed 명령과 선택 증명

`SPLIT_SOURCE_TABLE_CELLS_COMMAND`는 `SplitSourceTableCellsPayload`를 받는다. `target`은 활성 Surface lease가 `captureSourceTableCellSplit`으로 발급한 opaque 객체다. payload는 `rows`, `columns`, `mode`, `equalizeRows`만 추가한다. mode는 `each` 또는 `merge-then-split`이며 후자는 물리 셀 둘 이상을 요구한다.

Core는 merge와 동일한 선택 증명 발급 경로를 사용한다. 전체 표의 소유자·중첩 여부·격자와 span 덮임을 검사하고, 선택 셀의 문단 전체 순서를 현재 원본 owner와 대조한다. target은 editor 상태 객체와 lease 및 단조 무효화되는 current 검사에 묶인다. dispatch, IME/FIFO 정리 이후 실행, binding 조회 전후와 Native 전달 직전에 검사한다. Native는 현재 session/epoch/revision/serial 및 표 고유 identity를 재검사한다.

Runtime은 선택된 한 명령을 SDK에 전달하고 기존 atomic completion 처리와 History protocol 2를 사용한다. 적용 직후 applied/uncertain을 먼저 기록한 다음 화면을 다시 만든다. 갱신 실패 시 기존 committed-refresh-required 경로를 따른다.

## 실제 UI 수명

표 메뉴와 문맥 메뉴가 같은 도구를 연다. 대화상자는 `Surface.registerCellBlockMenu`를 통해 입력 owner에 등록한다. 셀 블록이나 커서 캡처를 대화상자에 먼저 묶고 단일 소유 modal만 허용한다. 선택 변경, lease 해제, 문서 교체 또는 revision 변경은 target을 무효화한다.

기본값은 줄 1, 칸 2, 개별 셀, 높이 균등이다. 개별 셀 수가 하나면 합친 후 나누기를 비활성화한다. 숫자 범위와 1×1 요청은 UI와 Core에서 검사한다. Native 거절은 대화상자에 표시하며 취소는 문서를 바꾸지 않는다.

## R4 검증 범위

정확한 main `022b773d1b1edf5552518f3bb3b1949caa5b762e`에 동결 R3 의존성을 적용한 격리 후보를 사용했다. 실제 WASM split/merge 회귀 47개, 실제 Core runtime split 8개와 merge 7개, focused TypeScript 검사를 통과했다.

Vanilla Worker 브라우저에서 실제 F5 2셀·4셀 선택과 표/문맥 메뉴, 병합 셀 커서, 높이 옵션 거절 및 재시도, 잘못된 숫자와 Escape 취소를 검증했다. 저장 XML은 R3의 독립 geometry/content/style oracle 결과와 비교했다. golden 비교는 문단 ID를 정규화하며 Native 회귀 oracle이 원본 문단 보존과 새 ID를 별도로 검사한다. undo/redo/재열기는 저장 바이트까지 비교했다.

React/Svelte host forwarding은 focused typecheck에 포함한다. 해당 두 프레임워크의 실제 브라우저, 실제 OS IME, 새 문서 생성 명령과의 Main 최종 합본은 후속 검증 범위다. R4는 기존 R3 Native 의미를 유지하며 shared managed-History helper 명칭은 `requireManagedHistory`를 사용한다.
