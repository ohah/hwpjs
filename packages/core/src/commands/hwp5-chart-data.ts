import type { HeadlessEditor } from '../editor/create-editor.ts';
import type { EditorState } from '../state/editor-state.ts';
import type { CommandResult } from '../editor/create-editor.ts';
import type { RuntimeReply } from '../contracts.ts';
import { readNativeReadSourceEvidence } from '../internal/native-read-source-evidence.ts';
// @ts-ignore Existing runtime-only current owner validator.
import { currentHwp5ChartTarget } from '../../../../web/preview/hwp5-chart-resources.mjs';
// @ts-ignore Existing runtime validator; portable public types are declared here.
import { hwp5ChartLiteralKind } from '../../../../js/hwp5-chart-literal-profiles.mjs';
import { checkedHwp5LiteralEdits } from '../../../../js/hwp5-chart-literal-edit.mjs';
export type Hwp5ChartDataTarget = Readonly<{ section: number; controlNode: number }>;
export type Hwp5ChartLiterals = Readonly<{
  categories: readonly string[];
  series: readonly { name: string; values: readonly string[] }[];
}>;
export type Hwp5ChartLiteralEdit =
  | Readonly<{ category: { category: number; expected: string; value: string } }>
  | Readonly<{ value: { series: number; category: number; expected: string; value: string } }>;
export type Hwp5ChartDataCapture = Readonly<{
  state: EditorState;
  target: Hwp5ChartDataTarget;
  literals: Hwp5ChartLiterals;
  profile?: string;
}>;
type Editor = Pick<
  HeadlessEditor,
  'getEditorState' | 'readResource' | 'requestExperimental' | 'registerStateListener'
>;
export interface Hwp5ChartDataEditor {
  presentation(): { enabled: boolean; reason?: string };
  targets(): readonly Hwp5ChartDataTarget[];
  current(capture: Hwp5ChartDataCapture): boolean;
  capture(target: Hwp5ChartDataTarget): Promise<Hwp5ChartDataCapture>;
  apply(
    capture: Hwp5ChartDataCapture,
    edits: readonly Hwp5ChartLiteralEdit[],
  ): Promise<CommandResult>;
}
function ownTarget(value: Hwp5ChartDataTarget): Hwp5ChartDataTarget {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw Error('InvalidChartTarget');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(fields).length !== 2 ||
    !['section', 'controlNode'].every(
      (k) =>
        fields[k] &&
        'value' in fields[k] &&
        Number.isSafeInteger(fields[k].value) &&
        fields[k].value >= 0 &&
        fields[k].value <= 0xffffffff &&
        !Object.is(fields[k].value, -0),
    )
  )
    throw Error('InvalidChartTarget');
  const section = fields.section.value,
    controlNode = fields.controlNode.value;
  if (typeof section !== 'number' || typeof controlNode !== 'number')
    throw Error('InvalidChartTarget');
  return Object.freeze({ section, controlNode });
}
function checkedLiterals(input: unknown): Hwp5ChartLiterals {
  if (
    !input ||
    typeof input !== 'object' ||
    !('categories' in input) ||
    !('series' in input) ||
    !Array.isArray(input.categories) ||
    !Array.isArray(input.series) ||
    !input.categories.length ||
    !input.series.length ||
    input.categories.length > 4096 ||
    input.series.length > 64 ||
    input.categories.length * input.series.length > 16384
  )
    throw Error('InvalidChartLiteralData');
  const text = (s: unknown): string => {
    if (typeof s !== 'string' || /[\uD800-\uDFFF]/u.test(s)) throw Error('InvalidChartLiteralData');
    return s;
  };
  const categories = Object.freeze(Array.from(input.categories, text));
  const series = Object.freeze(
    Array.from(input.series, (item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.name !== 'string' ||
        !Array.isArray(item.values) ||
        item.values.length !== categories.length
      )
        throw Error('InvalidChartLiteralData');
      return Object.freeze({
        name: text(item.name),
        values: Object.freeze(Array.from(item.values, text)),
      });
    }),
  );
  return Object.freeze({ categories, series });
}
function commandResult(value: CommandResult | RuntimeReply): value is CommandResult {
  return (
    [
      'rejected-unapplied',
      'committed-with-snapshot',
      'committed-refresh-required',
      'unknown-application',
      'known-no-op',
      'handled-without-runtime',
    ].includes(String(value.status)) &&
    value.context !== null &&
    typeof value.context === 'object' &&
    value.state !== null &&
    typeof value.state === 'object' &&
    (value.changed === null || typeof value.changed === 'boolean')
  );
}
/** Normal qualified Core only. Captures and Worker keys are not restored from JSON. */
export function createHwp5ChartDataEditor(editor: Editor): Hwp5ChartDataEditor {
  const captures = new WeakMap<Hwp5ChartDataCapture, string>();
  let busy = false;
  const inspect = () => {
    const state = editor.getEditorState(),
      c = state.content as Record<string, unknown> | undefined;
    if (
      state.status !== 'ready' ||
      !state.documentId ||
      state.historyRecoveryRequired ||
      state.nativeHistoryStats?.protocolVersion !== 2 ||
      !Number.isSafeInteger(state.nativeHistoryRevision) ||
      state.nativeHistoryRevision === 0xffffffff ||
      c?.format !== 'hwp5' ||
      c.readOnly ||
      c.limited ||
      c.window ||
      (state.capabilities as { readOnly?: boolean })?.readOnly ||
      c.hwp5ChartLiteralEditAvailable !== true ||
      readNativeReadSourceEvidence(state)?.format !== 'hwp5'
    )
      throw Error('Hwp5ChartLiteralEditUnavailable');
    return state;
  };
  const targets = () => {
    const state = inspect(),
      c = state.content as {
        hwp5ChartTargets?: readonly { section: number; controlNode: number }[];
      };
    return (c.hwp5ChartTargets ?? [])
      .filter((t) => currentHwp5ChartTarget(c, t))
      .map((t) => Object.freeze({ section: t.section, controlNode: t.controlNode }));
  };
  const current = (capture: Hwp5ChartDataCapture) => {
    try {
      return (
        captures.has(capture) &&
        inspect() === capture.state &&
        !!currentHwp5ChartTarget(capture.state.content, capture.target)
      );
    } catch {
      return false;
    }
  };
  return {
    presentation() {
      try {
        if (busy) throw Error('ChartDataBusy');
        inspect();
        if (!targets().length) throw Error('NoCurrentChart');
        return { enabled: true };
      } catch (e) {
        return { enabled: false, reason: (e as Error).message };
      }
    },
    targets,
    current,
    async capture(value) {
      const target = ownTarget(value);
      if (busy) throw Error('ChartDataBusy');
      const state = inspect();
      if (!currentHwp5ChartTarget(state.content, target)) throw Error('StaleChartLiteralCapture');
      busy = true;
      try {
        const reply = await editor.readResource(
          {
            kind: 'hwp5-chart-data-capture',
            section: target.section,
            controlNode: target.controlNode,
          },
          { token: state.token },
        );
        if (
          inspect() !== state ||
          reply.error ||
          reply.kind !== 'hwp5-chart-data-capture' ||
          reply.section !== target.section ||
          reply.controlNode !== target.controlNode ||
          typeof reply.leaseKey !== 'string' ||
          !reply.leaseKey ||
          reply.historyRevision !== state.nativeHistoryRevision
        )
          throw Error('StaleChartLiteralCapture');
        const literals = checkedLiterals(reply.literals);
        const profile = reply.profile;
        if (profile !== undefined) {
          if (typeof profile !== 'string') throw Error('InvalidChartLiteralData');
          hwp5ChartLiteralKind(profile);
        }
        const capture: Hwp5ChartDataCapture = Object.freeze({
          state,
          target: Object.freeze({ ...target }),
          literals,
          ...(profile === undefined ? {} : { profile }),
        });
        captures.set(capture, reply.leaseKey);
        return capture;
      } finally {
        busy = false;
      }
    },
    async apply(capture, edits) {
      if (busy || !current(capture)) throw Error('StaleChartLiteralCapture');
      const changes = checkedHwp5LiteralEdits(edits);
      const leaseKey = captures.get(capture)!;
      captures.delete(capture);
      busy = true;
      try {
        const result = await editor.requestExperimental(
          { kind: 'hwp5-chart-data-apply', leaseKey, edits: changes },
          { mutation: true, token: capture.state.token },
        );
        if (!commandResult(result)) throw Error('InvalidChartLiteralCommandResult');
        return result;
      } finally {
        busy = false;
      }
    },
  };
}
