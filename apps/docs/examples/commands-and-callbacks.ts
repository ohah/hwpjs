import {
  createCommand,
  SPLICE_TEXT_COMMAND,
  type HeadlessEditor,
  type SelectionTarget,
  type EditorError,
} from "@ohah/hwpjs";

export function observeEditor(
  editor: HeadlessEditor,
  onStatus: (status: string) => void,
  onError: (event: EditorError) => void,
) {
  onStatus(editor.read((state) => state.status));
  const offState = editor.registerStateListener((state) => onStatus(state.status));
  const offError = editor.registerErrorListener(onError);
  return () => {
    offState();
    offError();
  };
}

const HOST_NOTICE = createCommand<{ message: string }>("host-notice");

// 이미 준비된 ready editor를 전달합니다. true는 Native 편집 성공이 아닙니다.
export async function notifyHost(editor: HeadlessEditor, show: (message: string) => void) {
  const unregister = editor.registerCommand(
    HOST_NOTICE,
    (payload) => {
      show(payload.message);
      return true; // 후순위 handler와 Native fallback으로의 전파를 멈춥니다.
    },
    10,
  );
  try {
    const result = await editor.dispatchCommand(HOST_NOTICE, { message: "호스트 알림" });
    if (result.error) throw Error(result.error);
    return result; // handled-without-runtime. 저장 문서의 변경 증거가 아닙니다.
  } finally {
    unregister();
  }
}

export async function collectInsert(editor: HeadlessEditor, target: SelectionTarget, text: string) {
  // 콜백은 동기 수집만 합니다. Native 실행은 정상 반환 뒤 시작합니다.
  const result = await editor.update((collector, snapshot) => {
    if (snapshot.status !== "ready") throw Error("편집 준비가 되지 않았습니다.");
    collector.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text });
  });
  // 여러 명령을 수집해도 전체 rollback/read-your-writes를 보장하지 않습니다.
  // 실패 전 반영분은 남을 수 있으므로 results/status와 중단 위치를 확인합니다.
  return { results: result.results, stoppedIndex: result.stoppedIndex };
}
