import type { HeadlessEditor } from "@hwpjs/core";

/** Project the retained document's native policy, never the last consent click. */
export function mountSourcePolicyNotice(root: HTMLElement, editor: HeadlessEditor) {
  const note = root.ownerDocument.createElement("span");
  note.dataset.role = "source-policy-notice";
  note.setAttribute("role", "status");
  root.append(note);
  const refresh = () => {
    const content = editor.getEditorState().content as
      | {
          format?: string;
          readOnly?: boolean;
          primarySource?: string;
          editorSessionAvailable?: boolean;
          normalizationInfo?: {
            normalized?: boolean;
            historyBaseline?: string;
            missingContentRecovered?: boolean;
          };
        }
      | undefined;
    const copy =
      content?.format === "hwp5" &&
      content.normalizationInfo?.normalized === true &&
      content.normalizationInfo.historyBaseline === "available-sections-copy" &&
      content.normalizationInfo.missingContentRecovered === false;
    const distribution =
      content?.format === "hwp5" &&
      content.primarySource === "distribution_viewtext" &&
      content.readOnly === false &&
      content.editorSessionAvailable === true;
    note.textContent = copy
      ? "저장된 구역 사본 편집 중 · 저장·실행 취소 기준은 사본입니다."
      : distribution
        ? "배포용 문서 편집 중 · 배포 형식으로 저장합니다."
        : "";
    note.hidden = note.textContent === "";
  };
  const unsubscribe = editor.registerStateListener(refresh);
  refresh();
  return {
    dispose() {
      unsubscribe();
      note.remove();
    },
  };
}
