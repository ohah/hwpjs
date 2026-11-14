import type { SelectionTarget } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { validateSelection } from './selection.ts';

interface CurrentCaretErrors {
  readonly stale: string;
  readonly requiresCaret: string;
}
const documentInsertErrors: CurrentCaretErrors = {
  stale: 'StaleDocumentInsertSelection',
  requiresCaret: 'DocumentInsertionRequiresCaret',
};

/** Current editable caret identity only. Callers keep their typed owner policy.
 * Diagnostic labels preserve existing command errors; they do not change admission.
 * The actual state and both selections are checked without rewriting observations. */
export function validateCurrentCaret(
  state: EditorState,
  target: SelectionTarget,
  selectionVersion: number,
  errors: CurrentCaretErrors = documentInsertErrors,
) {
  if (selectionVersion !== state.stateVersion) throw Error(errors.stale);
  const live = state.selection as SelectionTarget | undefined;
  if (!live) throw Error(errors.requiresCaret);
  if (target?.startUnit !== target?.endUnit || live.startUnit !== live.endUnit)
    throw Error(errors.requiresCaret);
  const row = validateSelection(target, state, true);
  validateSelection(live, state, true);
  if (
    live.section !== target.section ||
    live.paragraph !== target.paragraph ||
    live.startUnit !== target.startUnit ||
    live.owner !== target.owner ||
    live.affinity !== target.affinity
  )
    throw Error(errors.stale);
  return row;
}
