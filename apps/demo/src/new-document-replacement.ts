import type { HeadlessEditor } from '@hwpjs/core';
import { requireOpenConsent } from './document-open-consent.ts';
/** A reachable undo entry is not a dirty flag. Save revisions own replacement consent. */
export async function confirmDocumentReplacement(
  editor: Pick<HeadlessEditor, 'getEditorState' | 'update'>,
  signal: AbortSignal,
  prompt: () => Promise<boolean>,
): Promise<boolean> {
  if (signal.aborted) return false;
  // Admission settles queued input and composition before observing dirty state.
  await editor.update(() => {});
  if (signal.aborted) return false;
  const before = editor.getEditorState();
  if (!before.documentId || before.operationRevision === before.savedOperationRevision) return true;
  if (!(await requireOpenConsent(signal, prompt)) || signal.aborted) return false;
  await editor.update(() => {});
  if (signal.aborted) return false;
  const now = editor.getEditorState();
  // Consent cannot discard edits or a different document that arrived while prompting.
  return (
    now.documentId === before.documentId &&
    now.operationRevision === before.operationRevision &&
    now.savedOperationRevision === before.savedOperationRevision
  );
}
