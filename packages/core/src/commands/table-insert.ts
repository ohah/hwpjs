import type { SelectionTarget } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import type { InsertTableOptions, TableInsertResources } from './table-insert-options.ts';
import { validateTableInsertOptions } from './table-insert-options.ts';
import { selectionMessage, validateSelection } from './selection.ts';
import { tableParagraphReference } from './table-paragraph-reference.ts';
export type { InsertTableOptions, TableInsertResources } from './table-insert-options.ts';
export interface InsertTablePayload {
  readonly target: SelectionTarget;
  readonly options: InsertTableOptions;
}
export type TableInsertAvailability =
  | { readonly allowed: true; readonly reason: null; readonly resources: TableInsertResources }
  | { readonly allowed: false; readonly reason: string; readonly resources: null };
/** Shared target admission; Native rechecks the current source binding before mutation. */
function tableInsertTarget(state: EditorState, target: SelectionTarget | null) {
  if (state.status !== 'ready') throw Error('EditorNotReady');
  if (state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
  const content = state.content as
    | {
        readOnly?: unknown;
        tableCreationAvailable?: unknown;
        tableCreationResources?: unknown;
      }
    | undefined;
  if (content?.readOnly || (state.capabilities as { readOnly?: unknown } | undefined)?.readOnly)
    throw Error('ReadOnlyDocument');
  if (!target) throw Error('MissingSelection');
  const row = validateSelection(target, state, true);
  if (target.startUnit !== target.endUnit) throw Error('TableInsertionRequiresCaret');
  if (
    target.owner !== `section:${target.section}:body` ||
    row.tableCell ||
    row.createdCell ||
    row.drawingText ||
    row.drawingCaption
  )
    throw Error('UnsupportedTableInsertOwner');
  const reference =
    target.format === 'hwp5'
      ? tableParagraphReference(row.currentReference, target.section)
      : undefined;
  if (content?.tableCreationAvailable !== true) throw Error('TableCreationUnavailable');
  return {
    mapped: selectionMessage(target, state),
    reference,
    resources: content.tableCreationResources,
  };
}
/** Pure snapshot query; dimensions and selected resources are validated again on dispatch. */
export function getTableInsertAvailability(
  state: EditorState,
  target: SelectionTarget | null,
): TableInsertAvailability {
  try {
    const { resources } = tableInsertTarget(state, target);
    const ids = resources as Record<string, unknown> | undefined;
    // Ask the existing options validator whether any advertised default is usable.
    const chosen = Object.fromEntries(
      ['paragraph', 'character', 'style', 'border_fill'].map((key) => {
        const values = ids?.[key];
        return [key, Array.isArray(values) ? values[0] : undefined];
      }),
    );
    const defaults = validateTableInsertOptions(
      { rows: 1, columns: 1, width: 1, rowHeight: 1, resources: chosen },
      resources,
    );
    return Object.freeze({
      allowed: true,
      reason: null,
      resources: Object.freeze({ ...defaults.resources }),
    });
  } catch (error) {
    return Object.freeze({
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
      resources: null,
    });
  }
}
export function tableInsertMessage(payload: InsertTablePayload, state: EditorState) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Reflect.ownKeys(payload).length !== 2 ||
    !['target', 'options'].every((key) => Object.hasOwn(payload, key)) ||
    Reflect.ownKeys(payload).some(
      (key) =>
        typeof key !== 'string' ||
        !['target', 'options'].includes(key) ||
        !('value' in Object.getOwnPropertyDescriptor(payload, key)!),
    )
  )
    throw Error('InvalidTableInsertPayload');
  const { mapped, reference, resources } = tableInsertTarget(state, payload.target);
  const options = validateTableInsertOptions(payload.options, resources);
  return {
    kind: 'insert-table',
    ...(reference === undefined ? {} : { reference }),
    section: mapped.section,
    paragraph: mapped.paragraph,
    unit: mapped.startUnit,
    options,
  };
}
