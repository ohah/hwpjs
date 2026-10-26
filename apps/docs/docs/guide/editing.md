# 열기 → 선택 → 입력 → 저장

파일 선택과 파일 읽기는 호스트 앱의 책임입니다. `load`는 URL이나 파일 경로가 아니라 `Uint8Array` 또는 `ArrayBuffer`를 받습니다. `detectDocumentFormat`은 컨테이너 구분이며 문서의 모든 내용이 지원된다는 판정은 아닙니다.

호스트가 [Reader 또는 Worker runtime factory](./runtime.md)와 동의 콜백을 주입합니다. `replaceFirst`는 호출자가 소유한 editor로 편집·저장을 수행하며, 저장 취소나 실패만으로 editor를 종료하지 않습니다. `withEditor`는 한 번의 작업 수명이 필요한 호스트용 도우미이며 작업을 빠져나갈 때만 `finally`에서 종료합니다.

<!-- example:editing.ts -->
```ts
import {
  createEditor,
  detectDocumentFormat,
  findTextMatch,
  SPLICE_TEXT_COMMAND,
  type HeadlessEditor,
  type RuntimeFactory,
  type SaveResult,
} from "@ohah/hwpjs";

export type ConfirmLayoutSave = (notice: { reason: "LayoutReflowRequired" }) => Promise<boolean>;
export type SaveOutcome = { status: "saved"; result: SaveResult } | { status: "cancelled" };

export async function saveWithLayoutConsent(
  editor: HeadlessEditor,
  confirm: ConfirmLayoutSave,
): Promise<SaveOutcome> {
  const token = editor.getEditorState().token;
  try {
    // 첫 저장에는 손실 허용 옵션을 지정하지 않습니다.
    return { status: "saved", result: await editor.save({ token }) };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "LayoutReflowRequired") throw error;
  }
  // dialog/CLI 등 UI는 호스트가 소유합니다. true만 명시적 동의입니다.
  if ((await confirm({ reason: "LayoutReflowRequired" })) !== true) {
    return { status: "cancelled" }; // 편집값과 editor를 유지합니다.
  }
  // 동의 대기 중 문서/편집이 바뀌면 token 검증으로 거부합니다. 편집은 재전송하지 않습니다.
  // 재저장 실패도 호출자에게 전달하며 자동 재시도/종료하지 않습니다.
  return { status: "saved", result: await editor.save({ token, allowStaleLayout: true }) };
}

export async function replaceFirst(
  editor: HeadlessEditor,
  bytes: Uint8Array,
  query: string,
  replacement: string,
  confirm: ConfirmLayoutSave,
): Promise<SaveOutcome> {
  await editor.load(bytes, { format: detectDocumentFormat(bytes), editable: true });
  const state = editor.getEditorState();
  const target = findTextMatch(state, query, { origin: "document", wrap: false });
  if (!target) throw Error("현재 관측 범위에서 찾지 못했습니다.");
  const selected = await editor.setSelection(target, { stateVersion: state.stateVersion });
  const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
    target,
    text: replacement,
    selectionVersion: selected.stateVersion,
  });
  if (result.status === "committed-refresh-required") {
    await editor.refresh(); // 이미 반영된 편집을 재전송하지 않습니다.
  } else if (result.error) {
    throw Error(result.error);
  } else if (result.status !== "committed-with-snapshot") {
    throw Error(`교체를 완료하지 못했습니다: ${result.status}`);
  }
  return saveWithLayoutConsent(editor, confirm);
}

// 호스트는 work 안에서 취소/오류 후 재시도·계속 편집을 결정합니다.
// work를 끝내면 저장 여부와 무관하게 finally에서 editor를 종료합니다.
export async function withEditor<T>(
  runtimeFactory: RuntimeFactory,
  work: (editor: HeadlessEditor) => Promise<T>,
): Promise<T> {
  const editor = createEditor({ runtimeFactory });
  try {
    return await work(editor);
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

## 저장 동의와 수명

`saveWithLayoutConsent`는 먼저 손실 허용 없이 저장합니다. 실제 b7 HWP5에서 관찰한 `LayoutReflowRequired` 오류에만 `confirm`을 호출하며, `true`로 동의한 경우에만 같은 편집의 저장을 `allowStaleLayout: true`로 한 번 재시도합니다. 이 옵션은 원본과 같은 조판을 보장하지 않습니다. 다른 오류·보호 해제·recovery에는 자동 허용을 적용하지 않습니다.

동의 취소는 `{ status: 'cancelled' }`를 반환하며 편집값과 editor는 유지됩니다. 이후 호스트는 같은 editor에 `saveWithLayoutConsent`를 다시 호출하거나 계속 편집할 수 있습니다. `replaceFirst`를 다시 호출하면 문서 열기와 편집부터 재실행하므로 저장 재시도에 사용하지 않습니다. 동의 콜백 실패와 재저장 오류는 호출자에게 전달하며 editor를 자동 종료하지 않습니다. 동의 중 문서나 편집이 바뀌면 처음 포착한 token으로 저장을 거부하므로 새 상태에 대한 동의를 다시 받아야 합니다.

`withEditor`의 `work` 안에서 취소·오류 처리와 재시도를 마친 뒤 결과를 반환하세요. `work`가 반환하거나 오류로 끝나면 저장 여부와 무관하게 `finally`에서 dispose합니다. 취소 후 편집을 계속 유지할 브라우저 앱은 도우미를 즉시 종료하지 말고 앱 수명으로 editor를 소유하세요. 이 예제는 편집값 유지를 저장 파일 생성과 동일시하지 않습니다.
