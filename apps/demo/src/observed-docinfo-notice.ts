import type { HeadlessEditor } from '@hwpjs/core';
// @ts-ignore Source summary owns the diagnostic fields and presentation.
import { observedDocInfoSummary } from '../../../web/preview/observed-docinfo-consent.mjs';
export function mountObservedDocInfoNotice(root: HTMLElement, editor: HeadlessEditor) {
  const note = root.ownerDocument.createElement('span');
  note.dataset.role = 'observed-docinfo-notice';
  note.setAttribute('role', 'status');
  root.append(note);
  const refresh = () => {
    const content = editor.getEditorState().content as
      | { observedDocInfoDiagnostics?: unknown }
      | undefined;
    const text = observedDocInfoSummary(content?.observedDocInfoDiagnostics);
    note.hidden = !text;
    note.textContent = text ?? '';
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
