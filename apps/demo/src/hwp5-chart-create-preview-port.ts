import type { EditorState, HeadlessEditor, SelectionTarget } from '@hwpjs/core';
import {
  checkedHwp5ChartCreateOptions,
  type Hwp5ChartCreateOptions,
} from '../../../js/hwp5-chart-create.mjs';
import type { Hwp5ChartCreateProfile } from '../../../packages/core/src/commands/hwp5-chart-create-dto.ts';
import {
  HWP5_CHART_CREATE_PROFILE,
  supportsHwp5ChartCreateProfile,
} from '../../../js/hwp5-chart-create-profiles.mjs';
import type {
  ChartCreateOptions,
  CreateChartPayload,
} from '../../../packages/core/src/commands/inline-object-insert.ts';
import type { InlineObjectInsertCapture } from './inline-object-insert-port.ts';
import {
  createHwp5ChartCreateInputLane,
  type ChartRasterPayload,
  type ChartRasterPixels,
} from './hwp5-chart-create-input-lane.ts';
import { hwp5ChartRasterSize } from './hwp5-chart-raster-size.mjs';

type Capture = InlineObjectInsertCapture;
type Payload = {
  target: CreateChartPayload['target'];
  selectionVersion: number;
  options: Hwp5ChartCreateOptions;
};
export interface Hwp5ChartCreatePreviewCore {
  hwp5ChartCreatePreviewMessage(
    payload: Payload,
    state: EditorState,
  ): { kind: 'hwp5-chart-create-preview'; request: unknown };
  getInlineObjectInsertAvailability(
    state: EditorState,
    kind: 'chart',
    chart?: undefined,
    target?: Capture['target'],
  ): { enabled: boolean; reason?: string };
}
/** Optional read-only UI adapter. It never enables insertion, selects an
 * experimental profile, sends PNG to create, or dispatches an edit command. */
export function createHwp5ChartCreatePreviewPort(options: {
  editor: Pick<HeadlessEditor, 'getEditorState' | 'readResource'>;
  core: Hwp5ChartCreatePreviewCore;
  isCaptureCurrent(capture: Capture): boolean;
  render(
    wire: Uint8Array,
    size: ChartRasterPixels,
    current: () => boolean,
    profile: Hwp5ChartCreateProfile,
  ): Promise<ChartRasterPayload>;
}) {
  type Wrapped = { capture: Capture; profile: Hwp5ChartCreateProfile; current(): boolean };
  const current = (
    capture: Capture,
    profile: Hwp5ChartCreateProfile = HWP5_CHART_CREATE_PROFILE,
  ) => {
    try {
      const state = options.editor.getEditorState(),
        content = state.content as Record<string, unknown> | undefined;
      return (
        state === capture.state &&
        capture.kind === 'chart' &&
        state.status === 'ready' &&
        content?.format === 'hwp5' &&
        content.chartCreationAvailable === true &&
        supportsHwp5ChartCreateProfile(content.hwp5ChartCreateProfileVersion, profile) &&
        options.isCaptureCurrent(capture) === true &&
        options.core.getInlineObjectInsertAvailability(state, 'chart', undefined, capture.target)
          .enabled === true
      );
    } catch {
      return false;
    }
  };
  const makeOptions = (draft: ChartCreateOptions, profile: string) => {
    // Reject an explicit HWPX chart family instead of silently dropping it.
    if (Object.hasOwn(draft, 'chart')) throw Error('UnsupportedChartCreateProfile');
    return checkedHwp5ChartCreateOptions({
      ...draft,
      profile,
      preview: hwp5ChartRasterSize(draft),
    });
  };
  const lane = createHwp5ChartCreateInputLane<Wrapped>({
    preview: async (draft, wrapped) => {
      if (!current(wrapped.capture, wrapped.profile)) throw Error('StaleChartCreateInput');
      const capture = wrapped.capture;
      const target = capture.target ?? (capture.state.selection as SelectionTarget | null);
      if (!target) throw Error('StaleChartCreateInput');
      const request = options.core.hwp5ChartCreatePreviewMessage(
        {
          target,
          selectionVersion: capture.state.stateVersion,
          options: makeOptions(draft, wrapped.profile),
        },
        capture.state,
      );
      const reply = await options.editor.readResource(request, { token: capture.state.token });
      if (!current(capture, wrapped.profile)) throw Error('StaleChartCreateInput');
      if (
        reply.kind !== 'hwp5-chart-create-preview' ||
        reply.error ||
        !(reply.preview instanceof Uint8Array)
      )
        throw Error('InvalidChartCreatePreview');
      return reply.preview;
    },
    render: (wire, size, live, wrapped) => options.render(wire, size, live, wrapped.profile),
  });
  type Prepared = Awaited<ReturnType<typeof lane.prepare>>;
  const issued = new WeakSet<Prepared>();
  return {
    async prepare(capture: Capture, draft: ChartCreateOptions, profile: string): Promise<Prepared> {
      if (!current(capture)) throw Error('StaleChartCreateInput');
      const checked = makeOptions(draft, profile);
      if (!current(capture, checked.profile)) throw Error('UnsupportedChartCreateProfile');
      const wrapped = Object.freeze({
        capture,
        profile: checked.profile,
        current: () => current(capture, checked.profile),
      });
      const value = await lane.prepare(wrapped, draft, checked.preview);
      issued.add(value);
      return value;
    },
    current(value: Prepared) {
      return issued.has(value) && lane.current(value);
    },
    take(value: Prepared) {
      if (!issued.has(value)) throw Error('StaleChartCreateInput');
      const taken = lane.take(value);
      issued.delete(value);
      return Object.freeze({
        capture: taken.capture.capture,
        options: makeOptions(taken.options, taken.capture.profile),
      });
    },
    invalidate: () => lane.invalidate(),
    dispose: () => lane.dispose(),
  };
}
