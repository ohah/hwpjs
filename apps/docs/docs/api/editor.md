# HeadlessEditor

[공개 API 직접 실행](./playground.mdx)에서 실제 코드·JSON 인수·반환값·오류를 확인할 수 있습니다.

`createEditor({ runtimeFactory, onError? })`가 반환하는 객체의 public 소스 계약입니다. 타입 export는 `@ohah/hwpjs`, runtime 구현은 `@ohah/hwpjs/runtime`으로 나뉩니다.

| 작업 | public API | 의미 |
| --- | --- | --- |
| 열기 | `load(bytes, options)` | format: hwp5/hwpx, editable 등 명시적 옵션 |
| 암호/취소 | `unlock`, `cancelLoad` | 잠긴 후보의 암호 시도와 load 취소 |
| 관측 | `getEditorState()`, `read(callback)` | owned 상태 snapshot, 동기 읽기 |
| 선택 | `setSelection(target, options?)` | 현재 display target; null은 선택 해제 |
| 명령 | `dispatchCommand(command, payload)` | 결과 status/error를 반드시 확인 |
| 명령 handler | `registerCommand(command, handler, priority?)` | 동기 Boolean 처리·우선순위·해제 함수 |
| 묶음 수집 | `update(collector)` | 동기 명령 수집, 전체를 무조건 원자적 성공으로 보장하지 않음 |
| 저장 | `save(options?)` | 현재 문서 형식의 bytes 반환 |
| 이력 | `undo()`, `redo()`, `getHistoryAvailability(state)` | Native 이력과 capability에 따른 사용 가능 상태 |
| 재관측 | `refresh()` | refresh-required 상태의 관측 갱신 |
| 구독 | `registerStateListener`, `registerUpdateListener`, `registerErrorListener` | 반환된 해제 함수로 구독 정리 |
| 종료 | `dispose()` | terminal 종료; 같은 객체 재사용 불가 |

`EditorState`는 저장 문서 모델이 아닙니다. `content`, `capabilities`, `selection`은 공개 타입상 unknown인 관측값입니다. 임의 JSON 구조로 수정해서 Native 문서를 바꿀 수 없습니다. `state.token`은 editor/document/generation/revision 소유권을 검증하며, 저장 bytes를 다시 여는 것과 과거 snapshot을 재주입하는 것은 다릅니다.

`read()`와 state.read() 콜백은 동기 조회만 수행합니다. 이 콜백 안에서 load/dispatch/save를 하거나 async 함수를 넘기지 마세요. 상태 구독은 등록 전에 현재값을 `getEditorState()`로 읽고, 종료 시 구독을 해제하는 방식으로 구성할 수 있습니다.

## CommandResult

| status | 처리 |
| --- | --- |
| rejected-unapplied | 미반영 거부. 오류와 현재 대상을 확인 |
| committed-with-snapshot | 반영과 관측 게시 완료 |
| committed-refresh-required | 반영됐으나 재관측 필요. 편집 재전송 금지 |
| known-no-op | 알려진 무변경 결과 |
| handled-without-runtime | 외부 handler가 처리; Native 문서 변경 성공 증거가 아님 |

`changed`는 true/false/null일 수 있습니다. 명령 처리 여부를 저장 성공이나 전체 문서 지원으로 확대하지 마세요. [전체 사용 예제](../guide/editing.md)는 status에 따라 분기합니다.

## 저수준 연계

`requestExperimental`, `readResource`, `acquireInputSurface`와 lease는 제한된 runtime/호스트 연계 포트입니다. 전용 typed field/table/object API가 모두 준비됐다는 뜻이 아닙니다. 새 기능은 [지원 범위](../guide/limitations.md)의 전용 공개 계약 여부부터 확인하세요.

## 명령 등록·동기 수집·구독 해제

아래는 현재 소스의 공개 API 예제입니다. 공개 API 플레이그라운드의 메뉴나 npm의 새 출시를 의미하지 않습니다. `notifyHost`는 문서를 먼저 연 `ready` editor를 받고 호스트 알림만 처리합니다. `true`는 명령 전파 중단이며 Native 문서 변경 성공이 아닙니다. 우선순위는 큰 값부터, 동률은 등록 순서입니다.

`collectInsert`의 target은 현재 관측값에서 검증한 선택이어야 합니다. `update`는 콜백 안에서 명령을 수집한 뒤 순서대로 실행하며, 여러 Native 편집 전체의 rollback이나 콜백 안의 read-your-writes를 제공하지 않습니다. 실패 전 반영된 명령은 유지될 수 있고 뒤 명령은 중단됩니다. 반영됐으나 snapshot을 다시 읽어야 하는 상태도 있으므로 `results`의 status/error와 `stoppedIndex`를 확인하고 편집을 자동 재전송하지 않습니다.

read/update/명령 handler는 동기 콜백입니다. listener가 반환한 Promise는 publication이 기다리지 않으므로 비동기 작업 완료를 DOM paint 완료나 다음 명령의 선행 조건으로 삼지 마세요. 관측 구독의 해제 함수는 호스트 수명이 끝날 때 호출합니다.

<!-- example:commands-and-callbacks.ts -->
```ts
import {
  createCommand, SPLICE_TEXT_COMMAND,
  type HeadlessEditor, type SelectionTarget, type EditorError,
} from '@ohah/hwpjs';

export function observeEditor(
  editor: HeadlessEditor,
  onStatus: (status: string) => void,
  onError: (event: EditorError) => void,
) {
  onStatus(editor.read(state => state.status));
  const offState = editor.registerStateListener(state => onStatus(state.status));
  const offError = editor.registerErrorListener(onError);
  return () => { offState(); offError(); };
}

const HOST_NOTICE = createCommand<{ message: string }>('host-notice');

// 이미 준비된 ready editor를 전달합니다. true는 Native 편집 성공이 아닙니다.
export async function notifyHost(editor: HeadlessEditor, show: (message: string) => void) {
  const unregister = editor.registerCommand(HOST_NOTICE, payload => {
    show(payload.message);
    return true; // 후순위 handler와 Native fallback으로의 전파를 멈춥니다.
  }, 10);
  try {
    const result = await editor.dispatchCommand(HOST_NOTICE, { message: '호스트 알림' });
    if (result.error) throw Error(result.error);
    return result; // handled-without-runtime. 저장 문서의 변경 증거가 아닙니다.
  } finally {
    unregister();
  }
}

export async function collectInsert(editor: HeadlessEditor, target: SelectionTarget, text: string) {
  // 콜백은 동기 수집만 합니다. Native 실행은 정상 반환 뒤 시작합니다.
  const result = await editor.update((collector, snapshot) => {
    if (snapshot.status !== 'ready') throw Error('편집 준비가 되지 않았습니다.');
    collector.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text });
  });
  // 여러 명령을 수집해도 전체 rollback/read-your-writes를 보장하지 않습니다.
  // 실패 전 반영분은 남을 수 있으므로 results/status와 중단 위치를 확인합니다.
  return { results: result.results, stoppedIndex: result.stoppedIndex };
}
```
