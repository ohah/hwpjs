# 열기 → 선택 → 입력 → 저장

파일 선택과 파일 읽기는 호스트 앱의 책임입니다. `load`는 URL이나 파일 경로가 아니라 `Uint8Array` 또는 `ArrayBuffer`를 받습니다. `detectDocumentFormat`은 컨테이너 구분이며 문서의 모든 내용이 지원된다는 판정은 아닙니다.

아래 함수는 한 번의 실행을 소유하고 종료하는 headless 예제입니다. 두 번째 인자로 [Reader 또는 Worker runtime factory](./runtime.md)를 전달합니다. 실제 브라우저 편집기를 오래 유지하려면 [Vanilla](../frameworks/vanilla.md)처럼 editor 수명을 앱이 소유하세요.

<!-- example:editing.ts -->
```ts
import {
  createEditor, detectDocumentFormat, findTextMatch, SPLICE_TEXT_COMMAND,
  type RuntimeFactory,
} from '@hwpjs/core';

// runtimeFactory는 호출마다 새 문서 runtime을 만들어야 합니다.
export async function replaceFirst(
  bytes: Uint8Array,
  runtimeFactory: RuntimeFactory,
  query: string,
  replacement: string,
) {
  const editor = createEditor({ runtimeFactory });
  try {
    await editor.load(bytes, { format: detectDocumentFormat(bytes), editable: true });
    const state = editor.getEditorState();
    const target = findTextMatch(state, query, { origin: 'document', wrap: false });
    if (!target) throw Error('현재 관측 범위에서 찾지 못했습니다.');
    const selected = await editor.setSelection(target, { stateVersion: state.stateVersion });
    const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target,
      text: replacement,
      selectionVersion: selected.stateVersion,
    });
    if (result.status === 'committed-refresh-required') {
      // 이미 반영된 명령을 다시 보내지 않고 관측만 갱신합니다.
      await editor.refresh();
    } else if (result.error) {
      throw Error(result.error);
    } else if (result.status !== 'committed-with-snapshot') {
      throw Error(`교체를 완료하지 못했습니다: ${result.status}`);
    }
    return await editor.save();
  } finally {
    await editor.dispose();
  }
}
```

## 선택 좌표

검색 helper가 반환한 `SelectionTarget`에는 현재 token과 display owner·section·paragraph·UTF-16 범위가 들어 있습니다. 원본 HWP list/paragraph/position 좌표와 같지 않습니다. 임의의 숫자 좌표나 지난 문서의 token을 재사용하지 마세요. 비동기 UI 동작에는 `stateVersion`/`selectionVersion`으로 관측 경합도 검증합니다.

찾기는 현재 표시 snapshot 안의 literal 검색입니다. 잘린 문단이나 불러오지 않은 부분을 전체 문서 검색으로 보장하지 않습니다. 대상이 보호 구간이거나 지원되지 않으면 선택 또는 편집이 거부될 수 있습니다.

## 결과와 저장

명령이 Promise를 resolve했다고 항상 반영된 것은 아닙니다. `error`와 `status`를 확인합니다. `committed-refresh-required`는 이미 반영됐지만 관측 갱신이 필요한 상태입니다. 같은 편집을 재전송하지 않고 `refresh()`로 갱신합니다.

`save()`는 현재 문서 형식의 `SaveResult.bytes`를 반환합니다. 디스크 쓰기·파일명·브라우저 다운로드는 호출 앱이 담당합니다. 저장은 HWP↔HWPX 변환이나 PDF/HTML export가 아닙니다. 조판이 오래됐거나 보호 출력 정책이 필요한 경우 기본 저장이 거부될 수 있습니다. `allowStaleLayout`, `allowUnprotectedOutput`, `recovery`를 오류 회피용으로 일괄 켜지 마세요.

## 암호와 원본 정책

암호가 필요한 경우 UI에서 입력받아 `unlock` 흐름을 사용합니다. 암호를 로그에 출력하거나 저장하지 마세요. 배포용 문서·관측 편차·일부 구역 복사·보호 출력은 독립 정책입니다. 데모의 동의 UI는 순수 core API가 자동으로 대신하지 않습니다.

[HeadlessEditor 계약](../api/editor.md)과 [지원 범위](./limitations.md)를 함께 읽어주세요.
