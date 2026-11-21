import { checkedHwp5ChartCreateOptions } from '../../../../js/hwp5-chart-create.mjs';
import {
  HWP5_CHART_CREATE_PROFILE,
  supportsHwp5ChartCreateProfile,
} from '../../../../js/hwp5-chart-create-profiles.mjs';
import type { Hwp5ChartCreateOptions, Hwp5ChartCreateRequest } from './hwp5-chart-create-dto.ts';
import { checkedHwp5EquationInsertOptions } from '../../../../js/hwp5-equation-insert.mjs';
import { selectionMessage } from './selection.ts';
import type { InlineObjectAddress, InlineObjectOwner } from './inline-object-placement-dto.ts';
import {
  captureInlineObjectCreateTarget,
  admitInlineObjectCreateTarget,
  type InlineObjectCreateTarget,
} from './inline-object-owner.ts';
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
  readonly colorRgb?: number;
  readonly lineMode?: boolean;
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
  readonly target: SelectionTarget | InlineObjectCreateTarget;
  readonly selectionVersion: number;
  readonly options: T;
}
export type InsertEquationPayload = InlineObjectInsertPayload<EquationInsertOptions>;
export type CreateChartPayload = InlineObjectInsertPayload<
  ChartCreateOptions | Hwp5ChartCreateOptions
>;
export type { Hwp5ChartCreateOptions };
/** Concrete transport unions prevent declarations from inferring JS validator imports. */
export type InlineObjectInsertMessage =
  | { readonly kind: 'create-chart'; readonly request: Hwp5ChartCreateRequest }
  | {
      readonly kind: 'create-chart';
      readonly request: {
        readonly target: InlineObjectAddress & {
          readonly unit: number;
          readonly expected_text: string;
        };
        readonly size: Pick<ChartCreateOptions, 'width' | 'height'>;
        readonly data: ChartCreateWireData;
        readonly chart?: ChartCreateProfile;
      };
    }
  | {
      readonly kind: 'insert-equation';
      readonly request: Required<EquationInsertOptions> & {
        readonly reference: unknown;
        readonly start: number;
      };
    }
  | {
      readonly kind: 'insert-equation';
      readonly request: EquationInsertOptions & {
        readonly section: number;
        readonly paragraph?: number;
        readonly owner?: InlineObjectOwner;
        readonly affinity?: 'forward' | 'backward';
        readonly start: number;
        readonly expectedText: string;
      };
    };
/** Preserve the existing preview transport union; runtime admission selects HWP5. */
export type Hwp5ChartCreatePreviewMessage = {
  readonly kind: 'hwp5-chart-create-preview';
  readonly request: InlineObjectInsertMessage['request'];
};

export const INSERT_EQUATION_COMMAND = createCommand<InsertEquationPayload>('insert-equation');
export const CREATE_CHART_COMMAND = createCommand<CreateChartPayload>('create-chart');

/** Capture before the command queue yields; reject accessors before reading arrays. */
export function captureInlineObjectInsertPayload(
  input: unknown,
  kind: InlineObjectKind,
): InsertEquationPayload | CreateChartPayload {
  const p = inlineInsertRecord(input, ['target', 'selectionVersion', 'options']);
  const target =
    Object.getOwnPropertyDescriptor(p.target ?? {}, 'coordinateSpace')?.value === 'inline-object'
      ? captureInlineObjectCreateTarget(p.target)
      : inlineInsertRecord(p.target, [
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
    target: target as SelectionTarget | InlineObjectCreateTarget,
    selectionVersion: p.selectionVersion,
  };
  return kind === 'equation'
    ? {
        ...base,
        options:
          target.format === 'hwp5'
            ? checkedHwp5EquationInsertOptions(p.options)
            : checkedEquationInsertOptions(p.options),
      }
    : {
        ...base,
        options:
          target.format === 'hwp5'
            ? checkedHwp5ChartCreateOptions(p.options)
            : checkedChartCreateOptions(p.options),
      };
}

/** Creation-only admission. Empty split body rows can retain anchored edit
 * provenance even though the saved host contains only empty text runs.
 * Native still validates the exact source witness and physical host structure.
 * Document insertion keeps its independent, stricter plain paragraph policy. */
export function currentInlineObjectInsertCaret(
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
    !['hwpx', 'hwp5'].includes(target.format) ||
    (target.format === 'hwpx' && target.section !== 0) ||
    target.owner !== `section:${target.section}:body` ||
    (target.format === 'hwp5' && !row.currentReference) ||
    row.createdCell ||
    row.tableCell ||
    row.drawingText ||
    row.drawingCaption ||
    (target.format === 'hwpx' && edit.plainEditable !== true && !emptyAnchor)
  )
    throw Error('UnsupportedInlineObjectInsertOwner');
  return row;
}

function admit(
  state: EditorState,
  target: SelectionTarget | InlineObjectCreateTarget,
  version: number,
  kind: InlineObjectKind,
) {
  if (state.status !== 'ready') throw Error('EditorNotReady');
  if (state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
  const content = state.content as Record<string, unknown> | undefined;
  if (content?.readOnly || (state.capabilities as { readOnly?: boolean })?.readOnly)
    throw Error('ReadOnlyDocument');
  if (state.nativeHistoryStats?.protocolVersion !== 2) throw Error('HistoryV2Required');
  const row =
    target.coordinateSpace === 'inline-object'
      ? { text: admitInlineObjectCreateTarget(state, target, version).expected_text }
      : currentInlineObjectInsertCaret(state, target, version);
  if (content?.limited === true || content?.window) throw Error('InlineObjectRequiresFullDocument');
  if (target.coordinateSpace !== 'inline-object' && content?.createdTableHostPending === true)
    throw Error('InlineObjectOwnerRequired');
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
  placementTarget?: InlineObjectCreateTarget,
) {
  try {
    const target = placementTarget ?? (state.selection as SelectionTarget);
    admit(state, target, state.stateVersion, kind);
    if (
      kind === 'chart' &&
      target.format === 'hwp5' &&
      !supportsHwp5ChartCreateProfile(
        (state.content as Record<string, unknown>)?.hwp5ChartCreateProfileVersion,
        HWP5_CHART_CREATE_PROFILE,
      )
    )
      throw Error('ChartCreateProfileUnavailable');
    if (
      kind === 'chart' &&
      target.format === 'hwpx' &&
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
): InlineObjectInsertMessage {
  inlineInsertRecord(payload, ['target', 'selectionVersion', 'options']);
  const row = admit(state, payload.target, payload.selectionVersion, kind);
  const t = payload.target;
  // HWPX row paragraph is zero based; Native source paragraph is one based.
  const address: InlineObjectAddress & { readonly unit: number; readonly expected_text: string } =
    t.coordinateSpace === 'inline-object'
      ? admitInlineObjectCreateTarget(state, t, payload.selectionVersion)
      : {
          section: t.section,
          paragraph: t.paragraph + 1,
          unit: t.startUnit,
          expected_text: row.text,
        };
  if (address.paragraph !== undefined && address.paragraph > 0xffffffff)
    throw Error('InvalidInlineObjectInteger');
  if (t.format === 'hwp5') {
    const mapped = selectionMessage(t, state);
    const reference = mapped.reference;
    if (!reference)
      throw Error(
        kind === 'chart' ? 'InvalidCurrentChartReference' : 'InvalidCurrentEquationReference',
      );
    if (kind === 'chart') {
      const version = (state.content as Record<string, unknown>)?.hwp5ChartCreateProfileVersion;
      if (!supportsHwp5ChartCreateProfile(version, HWP5_CHART_CREATE_PROFILE))
        throw Error('ChartCreateProfileUnavailable');
      const options = checkedHwp5ChartCreateOptions(payload.options);
      if (!supportsHwp5ChartCreateProfile(version, options.profile))
        throw Error('ChartCreateProfileUnavailable');
      return {
        kind: 'create-chart',
        request: { reference, start: mapped.startUnit, ...options },
      };
    }
    return {
      kind: 'insert-equation',
      request: {
        reference,
        start: mapped.startUnit,
        ...checkedHwp5EquationInsertOptions(payload.options),
      },
    };
  }
  if (kind === 'equation')
    return {
      kind: 'insert-equation',
      request: {
        section: address.section,
        ...(address.paragraph === undefined ? {} : { paragraph: address.paragraph }),
        start: address.unit,
        expectedText: address.expected_text,
        ...('owner' in address ? { owner: address.owner } : {}),
        ...('affinity' in address ? { affinity: address.affinity } : {}),
        ...checkedEquationInsertOptions(payload.options),
      },
    };
  const options = checkedChartCreateOptions(payload.options) as ChartCreateOptions;
  if (options.chart && (state.content as Record<string, unknown>)?.chartCreateProfileVersion !== 1)
    throw Error('ChartCreateProfileUnavailable');
  return {
    kind: 'create-chart',
    request: {
      target: address,
      size: { width: options.width, height: options.height },
      data: chartCreateWireData(options),
      ...(options.chart ? { chart: options.chart } : {}),
    },
  };
}

/** Read-only Native preview values for the same freshly admitted HWP5 caret.
 * The PNG stays outside this DTO and final creation paints again under new checks. */
export function hwp5ChartCreatePreviewMessage(
  payload: CreateChartPayload,
  state: EditorState,
): Hwp5ChartCreatePreviewMessage {
  if (payload.target.format !== 'hwp5') throw Error('UnsupportedChartCreateProfile');
  const message = inlineObjectInsertMessage(payload, state, 'chart');
  return { ...message, kind: 'hwp5-chart-create-preview' as const };
}
