import type { HeadlessEditor, EditorState, CommandResult } from '@hwpjs/core';
// @ts-ignore Existing bounded transport encoder; Native owns chart value semantics.
import { encodeChartPointBatch } from '../../../js/chart-point-batch.mjs';

export interface ChartTarget {
  readonly section: number;
  readonly wrapper: number;
}
export interface ChartPoint {
  readonly kind: string;
  readonly value: string;
  readonly index?: number;
}
export interface ChartCapture {
  readonly state: EditorState;
  readonly target: ChartTarget;
  readonly points: readonly ChartPoint[];
}
type Editor = Pick<
  HeadlessEditor,
  'getEditorState' | 'readResource' | 'requestExperimental' | 'registerStateListener'
>;
type Limits = { maxEdits: number; maxBytes: number; maxValueBytes: number };
const uint = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xffffffff;
export const editableChartPoint = (point: ChartPoint) =>
  [
    'numeric_cache',
    'numeric_literal',
    'string_cache',
    'string_literal',
    'multilevel_cache',
  ].includes(point.kind);
const stale = () => Error('차트 또는 문서 상태가 바뀌었습니다. 창을 다시 열어주세요.');

/** Only existing, source-owned HWPX charts. No chart creation or synthetic targets. */
export function createChartDataPort(editor: Editor) {
  let busy = false;
  const captures = new WeakMap<ChartCapture, { pair: unknown; revision: number; limits: Limits }>();
  function inspect() {
    const state = editor.getEditorState();
    const content = state.content as Record<string, any> | undefined;
    const caps = state.capabilities as { readOnly?: boolean } | undefined;
    if (state.status !== 'ready' || !state.documentId || state.historyRecoveryRequired)
      throw Error('문서와 편집 이력이 준비된 뒤 다시 시도하세요.');
    if (
      content?.format !== 'hwpx' ||
      content.limited === true ||
      content.readOnly === true ||
      caps?.readOnly === true
    )
      throw Error('전체 편집 가능한 HWPX 문서가 필요합니다.');
    if (
      content.chartPointBatchEditAvailable !== true ||
      content.chartEditAvailable !== true ||
      content.chartStringEditAvailable !== true
    )
      throw Error('현재 엔진은 차트 데이터 일괄 편집을 지원하지 않습니다.');
    const limits = content.chartPointBatchLimits as Limits;
    if (
      !limits ||
      ![limits.maxEdits, limits.maxBytes, limits.maxValueBytes].every((n) => uint(n) && n > 0) ||
      limits.maxBytes < 4
    )
      throw Error('차트 편집 한도를 확인할 수 없습니다.');
    const revision = state.nativeHistoryRevision;
    if (!uint(revision) || revision === 0xffffffff)
      throw Error('현재 차트 편집 이력을 확인할 수 없습니다.');
    if (
      !Array.isArray(content.chartTargets) ||
      !content.chartTargets.length ||
      content.chartTargets.some((t: ChartTarget) => !t || !uint(t.section) || !uint(t.wrapper))
    )
      throw Error('편집할 기존 차트가 없습니다.');
    const targets = content.chartTargets.map((t: ChartTarget) =>
      Object.freeze({ section: t.section, wrapper: t.wrapper }),
    );
    if (
      new Set(targets.map((t: ChartTarget) => `${t.section}:${t.wrapper}`)).size !==
        targets.length ||
      editor.getEditorState() !== state
    )
      throw stale();
    return { state, limits: { ...limits }, revision, targets: targets as readonly ChartTarget[] };
  }
  return {
    subscribe: (listener: () => void) => editor.registerStateListener(listener),
    getState: () => editor.getEditorState(),
    presentation() {
      try {
        if (busy) throw Error('차트 데이터를 처리하고 있습니다.');
        inspect();
        return { enabled: true };
      } catch (error) {
        return { enabled: false, reason: String((error as Error).message) };
      }
    },
    targets() {
      return inspect().targets;
    },
    current(capture: ChartCapture) {
      try {
        return captures.has(capture) && inspect().state === capture.state;
      } catch {
        return false;
      }
    },
    async capture(target: ChartTarget): Promise<ChartCapture> {
      if (busy) throw Error('차트 데이터를 처리하고 있습니다.');
      const initial = inspect();
      const owned = Object.freeze({ section: target.section, wrapper: target.wrapper });
      if (!initial.targets.some((t) => t.section === owned.section && t.wrapper === owned.wrapper))
        throw stale();
      const token = initial.state.token;
      if (editor.getEditorState() !== initial.state) throw stale();
      busy = true;
      try {
        const reply = await editor.readResource({ kind: 'chart-points', ...owned }, { token });
        if (
          inspect().state !== initial.state ||
          reply.error ||
          reply.kind !== 'chart-points' ||
          reply.section !== owned.section ||
          reply.wrapper !== owned.wrapper ||
          reply.historyRevision !== initial.revision
        )
          throw stale();
        const chart = reply.chart as
          | { pair?: Record<string, any>; values?: { points?: ChartPoint[] } }
          | undefined;
        const pair = chart?.pair;
        if (
          !pair ||
          typeof pair.chart_path !== 'string' ||
          typeof pair.ole_path !== 'string' ||
          pair.wrapper_node !== owned.wrapper ||
          pair.section_ordinal !== owned.section ||
          typeof pair.declared_external !== 'boolean' ||
          !Array.isArray(pair.section_sha256) ||
          pair.section_sha256.length !== 32 ||
          !pair.section_sha256.every((b: unknown) => uint(b) && b <= 255) ||
          !Array.isArray(chart?.values?.points) ||
          chart.values.points.some(
            (p) => !p || typeof p.kind !== 'string' || typeof p.value !== 'string',
          )
        )
          throw Error('현재 차트 데이터와 소유 정보를 확인할 수 없습니다.');
        const capture = Object.freeze({
          state: initial.state,
          target: owned,
          points: Object.freeze(
            chart.values.points.map((p) =>
              Object.freeze({ kind: p.kind, value: p.value, index: p.index }),
            ),
          ),
        });
        captures.set(capture, {
          pair: structuredClone(pair),
          revision: initial.revision,
          limits: initial.limits,
        });
        return capture;
      } finally {
        busy = false;
      }
    },
    async apply(
      capture: ChartCapture,
      values: readonly string[],
    ): Promise<Pick<CommandResult, 'status' | 'error'>> {
      if (busy) return { status: 'rejected-unapplied', error: '차트 데이터를 처리하고 있습니다.' };
      try {
        const lease = captures.get(capture);
        if (!lease || inspect().state !== capture.state) throw stale();
        if (!Array.isArray(values) || values.length !== capture.points.length)
          throw Error('차트 값 목록이 올바르지 않습니다.');
        const changes = values.flatMap((value, point) => {
          const before = capture.points[point].value;
          // Unicode mode matches only lone surrogates; valid pairs are one code point.
          if (typeof value !== 'string' || /[\uD800-\uDFFF]/u.test(value))
            throw Error('유효한 문자열을 입력하세요.');
          if (value === before) return [];
          if (!editableChartPoint(capture.points[point]))
            throw Error('지원하지 않는 차트 값입니다.');
          return [{ point, before, value }];
        });
        encodeChartPointBatch(changes, lease.limits, (value: string) => {
          const bytes = new TextEncoder().encode(value);
          if (bytes.length > lease.limits.maxValueBytes)
            throw Error('차트 값이 편집 한도를 초과합니다.');
          return bytes;
        });
        const message = {
          kind: 'chart-points-set',
          ...capture.target,
          expectedRevision: lease.revision,
          expectedPair: structuredClone(lease.pair),
          changes,
        };
        const token = capture.state.token;
        if (editor.getEditorState() !== capture.state) throw stale();
        if (!changes.length) return { status: 'known-no-op' };
        busy = true;
        // One worker request -> one existing atomic Native setChartPoints transaction.
        // An exception after dispatch is ambiguous and must be handled by the controller.
        const result = await editor.requestExperimental(message, { mutation: true, token });
        if (!result || typeof result.status !== 'string') throw Error('UnexpectedChartEditResult');
        return result as CommandResult;
      } catch (error) {
        if (busy) throw error;
        return { status: 'rejected-unapplied', error: (error as Error).message };
      } finally {
        busy = false;
      }
    },
  };
}
export type ChartDataPort = ReturnType<typeof createChartDataPort>;
