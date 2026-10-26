import type { EditorState, SelectionTarget } from '@hwpjs/core';
// @ts-ignore Existing shared owner projection; no parallel owner/coordinate model.
import { paragraphSelectionOwner } from '../../../web/preview/paragraph-selection.mjs';
/** Recover only the verified single-paragraph result. Never retoken an old selection blindly. */
export function replacementCaret(
  before: EditorState,
  after: EditorState,
  target: SelectionTarget,
  text: string,
): SelectionTarget | null {
  try {
    if (
      after.operationRevision !== before.operationRevision + 1 ||
      after.viewRevision !== before.viewRevision + 1 ||
      after.stateVersion !== before.stateVersion + 1
    )
      return null;
    if (
      after.status !== 'ready' ||
      after.selection ||
      before.editorId !== after.editorId ||
      before.documentId !== after.documentId ||
      before.generation !== after.generation ||
      /[\r\n]/.test(text)
    )
      return null;
    const oldContent = before.content as { format?: unknown; paragraphs?: unknown },
      newContent = after.content as { format?: unknown; paragraphs?: unknown };
    if (
      oldContent.format !== newContent.format ||
      newContent.format !== target.format ||
      !Array.isArray(oldContent.paragraphs) ||
      !Array.isArray(newContent.paragraphs)
    )
      return null;
    const matching = (rows: any[]) =>
      rows.filter((row) => row?.section === target.section && row?.paragraph === target.paragraph);
    const previous = matching(oldContent.paragraphs),
      next = matching(newContent.paragraphs);
    if (previous.length !== 1 || next.length !== 1) return null;
    const old = previous[0],
      row = next[0];
    if (old.clipped || row.clipped || typeof old.text !== 'string' || typeof row.text !== 'string')
      return null;
    if (
      row.text !== old.text.slice(0, target.startUnit) + text + old.text.slice(target.endUnit) ||
      paragraphSelectionOwner(old) !== target.owner ||
      paragraphSelectionOwner(row) !== target.owner
    )
      return null;
    for (const key of ['tableCell', 'drawingText', 'drawingCaption', 'createdCell'])
      if (JSON.stringify(old[key]) !== JSON.stringify(row[key])) return null;
    const identity = (value: any) => {
      if (
        !value ||
        typeof value !== 'object' ||
        value.kind !== 'original' ||
        typeof value.scope !== 'string' ||
        typeof value.id !== 'string'
      )
        return null;
      return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'epoch'));
    };
    if (old.currentReference === undefined && row.currentReference === undefined) {
      if (target.format !== 'hwpx') return null;
    } else {
      const oldIdentity = identity(old.currentReference),
        newIdentity = identity(row.currentReference);
      if (
        !oldIdentity ||
        !newIdentity ||
        JSON.stringify(oldIdentity) !== JSON.stringify(newIdentity)
      )
        return null;
      const a = old.currentReference.epoch,
        b = row.currentReference.epoch;
      if (
        typeof a !== 'string' ||
        typeof b !== 'string' ||
        !/^\d+$/.test(a) ||
        !/^\d+$/.test(b) ||
        BigInt(b) !== BigInt(a) + 1n
      )
        return null;
    }
    const unit = target.startUnit + text.length;
    return {
      ...after.token,
      coordinateSpace: 'display',
      format: target.format,
      owner: paragraphSelectionOwner(row),
      section: row.section,
      paragraph: row.paragraph,
      startUnit: unit,
      endUnit: unit,
      affinity: 'forward',
    };
  } catch {
    return null;
  }
}
