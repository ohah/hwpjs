import { inlineInsertRecord } from './hwpx-inline-object-record.mjs';
import {
  checkedInlineObjectTarget,
  requireInlineObjectPlacement,
} from './hwpx-inline-object-placement.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const encoder = new TextEncoder();
export function checkedNoteDeleteRequest(input) {
  const p = inlineInsertRecord(input, ['target']);
  const target = checkedInlineObjectTarget(p.target);
  if (!target.owner || target.owner.kind === 'createdCell') throw Error('InvalidNoteDeleteOwner');
  const text = target.expected_text;
  if (!text.isWellFormed() || text[target.unit] !== '\ufffc')
    throw Error('InvalidNoteDeleteAnchor');
  return { target };
}
export function createHwpxNoteDeleteApi({ wasm, memory, check }) {
  function available() {
    check();
    try {
      return (
        typeof wasm.hwpx_edit_delete_note === 'function' &&
        typeof wasm.hwpx_edit_note_delete_version === 'function' &&
        wasm.hwpx_edit_note_delete_version() === 1
      );
    } catch {
      return false;
    }
  }
  return {
    supportsNoteDeletionAbi: available,
    deleteNote(input) {
      check();
      const request = checkedNoteDeleteRequest(input);
      if (!available()) throw Error('NoteDeletionUnavailable');
      requireInlineObjectPlacement(wasm, request);
      const bytes = encoder.encode(JSON.stringify(request));
      if (bytes.length > 2 * 1024 * 1024) throw Error('LimitExceeded');
      return applyNativeEdit(
        memory,
        bytes,
        (ptr, size) => wasm.hwpx_edit_delete_note(ptr, size),
        'InvalidNoteDeleteResult',
      );
    },
  };
}
