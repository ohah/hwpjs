import type { HeadlessEditor, SaveOptions } from '@hwpjs/core';
// @ts-ignore Canonical save refusal guidance is shared with the preview.
import { presentSaveFailure } from '../../../web/preview/save-failure-guidance.mjs';

const layoutConsentLabel = '줄 배치가 달라질 수 있는 HWP 저장 허용';

/** Per-document user consent, separate from the document's authoritative state. */
export function mountSavePolicy(root: HTMLElement, editor: HeadlessEditor) {
  const doc = root.ownerDocument,
    label = doc.createElement('label'),
    input = doc.createElement('input');
  input.type = 'checkbox';
  input.dataset.role = 'allow-stale-layout';
  label.className = 'hwp-demo-save-policy';
  label.append(input, doc.createTextNode(layoutConsentLabel));
  label.title = '편집 후 줄 배치가 아직 갱신되지 않은 HWP는 한글에서 다시 조판해야 합니다.';
  const protection = doc.createElement('label'),
    unprotected = doc.createElement('input');
  protection.className = 'hwp-demo-save-policy';
  unprotected.type = 'checkbox';
  unprotected.dataset.role = 'allow-unprotected-output';
  protection.append(unprotected, doc.createTextNode('암호가 해제된 사본으로 저장하는 데 동의'));
  root.append(label, protection);
  let documentId: string | null = null,
    disposed = false;
  const refresh = () => {
    const state = editor.getEditorState();
    if (state.documentId !== documentId) {
      documentId = state.documentId;
      input.checked = unprotected.checked = false;
    }
    const content = state.content as
      | { format?: string; passwordProtectionRemoved?: boolean }
      | undefined;
    const hwp5 = content?.format === 'hwp5';
    label.hidden = !hwp5;
    input.disabled = !hwp5 || state.status !== 'ready';
    protection.hidden = content?.passwordProtectionRemoved !== true;
    unprotected.disabled = protection.hidden || state.status !== 'ready';
  };
  const unsubscribe = editor.registerStateListener(refresh);
  refresh();
  return {
    options(): SaveOptions {
      return {
        allowStaleLayout: !input.disabled && input.checked,
        allowUnprotectedOutput: !unprotected.disabled && unprotected.checked,
      };
    },
    failureGuidance(error: unknown, savedDocumentId: string | null): string | null {
      if (
        disposed ||
        !(error instanceof Error) ||
        error.message !== 'LayoutReflowRequired' ||
        !savedDocumentId
      )
        return null;
      const state = editor.getEditorState();
      if (
        state.documentId !== savedDocumentId ||
        state.status !== 'ready' ||
        (state.content as { format?: string } | undefined)?.format !== 'hwp5' ||
        input.disabled ||
        label.hidden ||
        input.closest('[hidden]')
      )
        return null;
      const note = { textContent: '' };
      presentSaveFailure(
        note,
        { kind: 'save', error: error.message },
        { format: 'hwp5', consent: input, consentLabel: layoutConsentLabel },
      );
      return note.textContent;
    },
    dispose() {
      disposed = true;
      unsubscribe();
      label.remove();
      protection.remove();
    },
  };
}
