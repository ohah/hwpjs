import { createCommand, type SelectionTarget } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { validateCurrentCaret } from './current-caret.ts';
import {
  checkedEquationInsertOptions,
  checkedChartCreateOptions,
  inlineInsertRecord,
  chartCreateWireData,
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
export type ChartGrouping = 'standard' | 'stacked' | 'percentStacked';
export type ChartStockRole = 'open' | 'high' | 'low' | 'close';
export type ChartCategoryProfile =
  | {
      readonly kind: 'barChart' | 'bar3DChart';
      readonly bar_direction: 'col' | 'bar';
      readonly grouping: ChartGrouping | 'clustered';
    }
  | {
      readonly kind: 'lineChart' | 'line3DChart' | 'areaChart' | 'area3DChart';
      readonly grouping: ChartGrouping;
    }
  | { readonly kind: 'radarChart'; readonly radar_style: 'standard' | 'marker' | 'filled' }
  | { readonly kind: 'pieChart' | 'pie3DChart' | 'doughnutChart' }
  | { readonly kind: 'ofPieChart'; readonly of_pie_type: 'pie' | 'bar' }
  | { readonly kind: 'surfaceChart' | 'surface3DChart'; readonly wireframe: boolean };
export type ChartScatterProfile = {
  readonly kind: 'scatterChart';
  readonly scatter_style: 'none' | 'line' | 'lineMarker' | 'marker' | 'smooth' | 'smoothMarker';
};
export type ChartBubbleProfile = { readonly kind: 'bubbleChart' };
export type ChartStockProfile = {
  readonly kind: 'stockChart';
  readonly stock_layout: 'highLowClose' | 'openHighLowClose';
};
export type ChartCreateProfile =
  | ChartCategoryProfile
  | ChartScatterProfile
  | ChartBubbleProfile
  | ChartStockProfile;
export interface ChartCreateSeries {
  readonly name: string;
  readonly values: readonly number[];
}
export interface ChartXYSeries extends ChartCreateSeries {
  readonly x_values: readonly number[];
}
export interface ChartBubbleSeries extends ChartXYSeries {
  readonly bubble_sizes: readonly number[];
}
export interface ChartStockSeries extends ChartCreateSeries {
  readonly stock_role: ChartStockRole;
}
type ChartGeometry = { readonly width: number; readonly height: number };
/** No chart preserves the exact legacy wire. Explicit profiles require v1 capability. */
export type ChartCreateOptions = ChartGeometry &
  (
    | {
        readonly chart?: never;
        readonly categories: readonly string[];
        readonly series: readonly ChartCreateSeries[];
      }
    | {
        readonly chart: ChartCategoryProfile;
        readonly categories: readonly string[];
        readonly series: readonly ChartCreateSeries[];
      }
    | {
        readonly chart: ChartScatterProfile;
        readonly categories: readonly [];
        readonly series: readonly ChartXYSeries[];
      }
    | {
        readonly chart: ChartBubbleProfile;
        readonly categories: readonly [];
        readonly series: readonly ChartBubbleSeries[];
      }
    | {
        readonly chart: ChartStockProfile;
        readonly categories: readonly string[];
        readonly series: readonly ChartStockSeries[];
      }
  );
/** Native wire values derive from the public numeric series contract. */
type ChartWireSeriesFor<S extends ChartCreateSeries> = {
  readonly [K in keyof S]: K extends 'values' | 'x_values' | 'bubble_sizes'
    ? readonly string[]
    : S[K];
};
type ChartWireDataFor<O extends ChartCreateOptions> = O extends ChartCreateOptions
  ? {
      readonly categories: O['categories'];
      readonly series: readonly ChartWireSeriesFor<O['series'][number]>[];
    }
  : never;
export type ChartCreateWireData = ChartWireDataFor<ChartCreateOptions>;
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
export function getInlineObjectInsertAvailability(
  state: EditorState,
  kind: InlineObjectKind,
  chart?: ChartCreateProfile,
) {
  try {
    const target = state.selection as SelectionTarget;
    admit(state, target, state.stateVersion, kind);
    if (
      kind === 'chart' &&
      chart &&
      (state.content as Record<string, unknown>)?.chartCreateProfileVersion !== 1
    )
      throw Error('ChartCreateProfileUnavailable');
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
  if (options.chart && (state.content as Record<string, unknown>)?.chartCreateProfileVersion !== 1)
    throw Error('ChartCreateProfileUnavailable');
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
      data: chartCreateWireData(options),
      ...(options.chart ? { chart: options.chart } : {}),
    },
  };
}
