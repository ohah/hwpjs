import { createCommand, type SelectionTarget } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { validateCurrentCaret } from './current-caret.ts';
import {
  checkedEquationInsertOptions,
  checkedChartCreateOptions,
  inlineInsertRecord,
} from '../../../../js/hwpx-inline-object-insert.mjs';

export interface EquationInsertOptions {
  readonly script: string;
  /** Explicit HWPUNIT geometry; no script-based size estimation. */
  readonly width: number;
  readonly height: number;
  readonly baseLine: number;
  readonly baseUnit: number;
  readonly version: string;
  readonly font: string;
}
/** Standard 2D vertical bar only. Native emits the chart package resources. */
export interface ChartCreateOptions {
  readonly width: number;
  readonly height: number;
  readonly categories: readonly string[];
  readonly series: readonly { readonly name: string; readonly values: readonly number[] }[];
}
export type InlineObjectKind = 'equation' | 'chart';
export interface InlineObjectInsertPayload<T> {
  readonly target: SelectionTarget;
  readonly selectionVersion: number;
  readonly options: T;
}
export type InsertEquationPayload = InlineObjectInsertPayload<EquationInsertOptions>;
export type CreateChartPayload = InlineObjectInsertPayload<ChartCreateOptions>;
export const INSERT_EQUATION_COMMAND = createCommand<InsertEquationPayload>('insert-equation');
export const CREATE_CHART_COMMAND = createCommand<CreateChartPayload>('create-chart');

/** Capture before the command queue yields; reject accessors before reading arrays. */
export function captureInlineObjectInsertPayload(
  input: unknown,
  kind: InlineObjectKind,
): InsertEquationPayload | CreateChartPayload {
  const p = inlineInsertRecord(input, ['target', 'selectionVersion', 'options']);
  const target = inlineInsertRecord(p.target, [
    'editorId',
    'documentId',
    'generation',
    'operationRevision',
    'viewRevision',
    'coordinateSpace',
    'format',
    'owner',
    'section',
    'paragraph',
    'startUnit',
    'endUnit',
    'affinity',
  ]);
  if (
    typeof p.selectionVersion !== 'number' ||
    !Number.isSafeInteger(p.selectionVersion) ||
    p.selectionVersion < 0
  )
    throw Error('InvalidInlineObjectSelectionVersion');
  const base = {
    target: target as SelectionTarget,
    selectionVersion: p.selectionVersion,
  };
  return kind === 'equation'
    ? { ...base, options: checkedEquationInsertOptions(p.options) }
    : { ...base, options: checkedChartCreateOptions(p.options) };
}

/** Creation-only admission. Empty split body rows can retain anchored edit
 * provenance even though the saved host contains only empty text runs.
 * Native still validates the exact source witness and physical host structure.
 * Document insertion keeps its independent, stricter plain paragraph policy. */
function currentInlineObjectInsertCaret(
  state: EditorState,
  target: SelectionTarget,
  version: number,
) {
  const row = validateCurrentCaret(state, target, version, {
    stale: 'StaleInlineObjectInsertSelection',
    requiresCaret: 'InlineObjectInsertionRequiresCaret',
  });
  const edit = row as typeof row & { plainEditable?: boolean; anchorEditable?: boolean };
  const emptyAnchor = edit.anchorEditable === true && row.text === '' && target.startUnit === 0;
  if (
    target.format !== 'hwpx' ||
    target.section !== 0 ||
    target.owner !== 'section:0:body' ||
    row.createdCell ||
    row.tableCell ||
    row.drawingText ||
    row.drawingCaption ||
    (edit.plainEditable !== true && !emptyAnchor)
  )
    throw Error('UnsupportedInlineObjectInsertOwner');
  return row;
}

function admit(
  state: EditorState,
  target: SelectionTarget,
  version: number,
  kind: InlineObjectKind,
) {
  if (state.status !== 'ready') throw Error('EditorNotReady');
  if (state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
  const content = state.content as Record<string, unknown> | undefined;
  if (content?.readOnly || (state.capabilities as { readOnly?: boolean })?.readOnly)
    throw Error('ReadOnlyDocument');
  if (state.nativeHistoryStats?.protocolVersion !== 2) throw Error('HistoryV2Required');
  const row = currentInlineObjectInsertCaret(state, target, version);
  if (content?.limited === true || content?.window) throw Error('InlineObjectRequiresFullDocument');
  const key = kind === 'equation' ? 'equationInsertionAvailable' : 'chartCreationAvailable';
  if (content?.[key] !== true) throw Error('InlineObjectInsertionUnavailable');
  // Requires an observed, enabled Native history, never guessed from a JS revision.
  if (
    !Number.isSafeInteger(state.nativeHistoryRevision) ||
    state.nativeHistoryRevision! < 0 ||
    state.nativeHistoryRevision! >= 0xffffffff
  )
    throw Error('HistoryNotEnabled');
  return row;
}
export function getInlineObjectInsertAvailability(state: EditorState, kind: InlineObjectKind) {
  try {
    const target = state.selection as SelectionTarget;
    admit(state, target, state.stateVersion, kind);
    return { enabled: true as const };
  } catch (error) {
    return { enabled: false as const, reason: (error as Error).message };
  }
}
/** Re-evaluate both in the Core queue and at Runtime admission. No preflight no-op. */
export function inlineObjectInsertMessage(
  payload: InsertEquationPayload | CreateChartPayload,
  state: EditorState,
  kind: InlineObjectKind,
) {
  inlineInsertRecord(payload, ['target', 'selectionVersion', 'options']);
  const row = admit(state, payload.target, payload.selectionVersion, kind);
  const t = payload.target;
  // HWPX row paragraph is zero based; Native source paragraph is one based.
  if (t.paragraph >= 0xffffffff) throw Error('InvalidInlineObjectInteger');
  if (kind === 'equation')
    return {
      kind: 'insert-equation',
      request: {
        section: 0,
        paragraph: t.paragraph + 1,
        start: t.startUnit,
        expectedText: row.text,
        ...checkedEquationInsertOptions(payload.options),
      },
    };
  const options = checkedChartCreateOptions(payload.options) as ChartCreateOptions;
  return {
    kind: 'create-chart',
    request: {
      target: {
        section: 0,
        paragraph: t.paragraph + 1,
        unit: t.startUnit,
        expected_text: row.text,
      },
      size: { width: options.width, height: options.height },
      data: {
        categories: options.categories,
        series: options.series.map((s) => ({ name: s.name, values: s.values.map(String) })),
      },
    },
  };
}
