import { EditorState, type StateData } from './editor-state.ts';
import type { SelectionTarget } from '../commands/commands.ts';
import { validateSelection } from '../commands/selection.ts';
import { createParagraphSelection } from './paragraph-selection.ts';
// Compare owned source-coordinate data without serializing it into a new authority.
function sameData(a: unknown, b: unknown): boolean {
  const pending: [unknown, unknown][] = [[a, b]],
    seen = new WeakMap<object, object>();
  while (pending.length) {
    const [x, y] = pending.pop()!;
    if (Object.is(x, y)) continue;
    if (
      !x ||
      !y ||
      typeof x !== 'object' ||
      typeof y !== 'object' ||
      Array.isArray(x) !== Array.isArray(y)
    )
      return false;
    if (
      !Array.isArray(x) &&
      (![Object.prototype, null].includes(Object.getPrototypeOf(x)) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(y)))
    )
      return false;
    const prior = seen.get(x);
    if (prior) {
      if (prior !== y) return false;
      continue;
    }
    seen.set(x, y);
    const left = Reflect.ownKeys(x),
      right = Reflect.ownKeys(y);
    if (left.length !== right.length) return false;
    for (const k of left) {
      if (!Object.hasOwn(y, k)) return false;
      pending.push([(x as any)[k], (y as any)[k]]);
    }
  }
  return true;
}
/** Restore UI selection data in the newly observed view. This issues neither a
 * Native read ref/stamp nor a geometry/write lease; those retain separate fences. */
export function reobserveReadViewSelection(
  before: EditorState,
  patch: Partial<StateData>,
): SelectionTarget | undefined {
  if (
    (patch.editorId !== undefined && patch.editorId !== before.editorId) ||
    (patch.documentId !== undefined && patch.documentId !== before.documentId) ||
    (patch.generation !== undefined && patch.generation !== before.generation) ||
    (patch.operationRevision !== undefined &&
      patch.operationRevision !== before.operationRevision) ||
    (patch.status !== undefined && patch.status !== 'ready')
  )
    return;
  if (
    before.status !== 'ready' ||
    before.historyRecoveryRequired ||
    patch.historyRecoveryRequired ||
    before.nativeHistoryRevision !== patch.nativeHistoryRevision ||
    !before.selection
  )
    return;
  try {
    const previous = before.selection as SelectionTarget;
    const oldRow = validateSelection(previous, before);
    if (oldRow.createdCell) return;
    const after = new EditorState({
      editorId: before.editorId,
      documentId: before.documentId,
      generation: before.generation,
      operationRevision: before.operationRevision,
      viewRevision: patch.viewRevision ?? before.viewRevision,
      stateVersion: before.stateVersion + 1,
      status: 'ready',
      content: patch.content,
      capabilities: patch.capabilities,
      nativeHistoryRevision: patch.nativeHistoryRevision,
    });
    const next = createParagraphSelection(after, {
      section: previous.section,
      paragraph: previous.paragraph,
      startUnit: previous.startUnit,
      endUnit: previous.endUnit,
      affinity: previous.affinity,
    });
    const row = validateSelection(next, after);
    if (
      row.createdCell ||
      next.owner !== previous.owner ||
      row.text !== oldRow.text ||
      !sameData(row.currentReference, oldRow.currentReference) ||
      !sameData(row.sourceOffsets, oldRow.sourceOffsets)
    )
      return;
    return next;
  } catch {
    return;
  }
}
