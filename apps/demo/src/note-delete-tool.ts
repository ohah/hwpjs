import { DELETE_NOTE_COMMAND, getNoteDeleteAvailability, type HeadlessEditor } from '@hwpjs/core';
import type { InlineObjectCaretCapture } from './inline-object-insert-port.ts';
/** UI coordinates locate a reference only; Native re-observes its actual owner. */
export function captureNoteDeleteAnchor(
  editor: Pick<HeadlessEditor, 'getEditorState'>,
  capture: InlineObjectCaretCapture | null,
): InlineObjectCaretCapture | null {
  const state = editor.getEditorState();
  if (
    !getNoteDeleteAvailability(state).enabled ||
    !capture ||
    capture.state !== state ||
    !capture.current() ||
    capture.selector.created_cell
  )
    return null;
  const rows =
    (
      state.content as {
        paragraphs?: {
          section: number;
          paragraph: number;
          text: string;
          clipped?: boolean;
          editable?: boolean;
          automaticNumbers?: { kind: string; unit: number }[];
        }[];
      }
    )?.paragraphs?.filter(
      (p) =>
        p.section === capture.selector.section && p.paragraph + 1 === capture.selector.paragraph,
    ) ?? [];
  if (
    rows.length !== 1 ||
    rows[0].clipped ||
    !rows[0].editable ||
    rows[0].text !== capture.expected_text ||
    rows[0].text[capture.unit] !== '\ufffc'
  )
    return null;
  const references = (rows[0].automaticNumbers ?? []).filter(
    (p) => p.kind === 'note-reference' && p.unit === capture.unit,
  );
  return references.length === 1 ? capture : null;
}
export function createNoteDeleteTool(options: {
  editor: HeadlessEditor;
  captureCaret(): InlineObjectCaretCapture | null;
  onStatus(text: string): void;
  onPresentationChange(): void;
  onClose(): void;
}) {
  let pending = false,
    disposed = false;
  const capture = () => captureNoteDeleteAnchor(options.editor, options.captureCaret());
  function presentation() {
    return !pending && !disposed && capture()
      ? { enabled: true }
      : { enabled: false, reason: '삭제할 각주나 미주 참조 표시 바로 앞에 커서를 놓으세요.' };
  }
  return {
    presentation,
    async remove() {
      if (pending || disposed) return;
      const current = capture();
      if (!current) return;
      pending = true;
      options.onPresentationChange();
      try {
        const target = await options.editor.getInlineObjectInsertTarget(
          current.selector,
          current.unit,
          { affinity: current.affinity ?? 'forward' },
        );
        if (disposed || options.editor.getEditorState() !== current.state || !current.current())
          throw Error('StaleNoteDeleteSelection');
        if (
          target.address.expected_text !== current.expected_text ||
          target.address.unit !== current.unit
        )
          throw Error('NoteDeleteTargetMismatch');
        const result = await options.editor.dispatchCommand(DELETE_NOTE_COMMAND, {
          target,
          selectionVersion: current.state.stateVersion,
        });
        if (!disposed)
          options.onStatus(
            result.status === 'committed-with-snapshot'
              ? '주석을 삭제했습니다. 실행 취소로 복원할 수 있습니다.'
              : result.status === 'committed-refresh-required'
                ? '삭제 결과의 표시를 확인해야 합니다. 다시 삭제하지 마세요.'
                : (result.error ?? '주석을 삭제하지 못했습니다.'),
          );
      } catch (error) {
        if (!disposed) options.onStatus('주석 삭제 결과를 확인하세요. ' + String(error));
      } finally {
        pending = false;
        if (!disposed) {
          options.onPresentationChange();
          options.onClose();
        }
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
