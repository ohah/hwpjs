import type { HeadlessEditor, EditorState, StateToken } from '@hwpjs/core';
// @ts-ignore Existing Native display-host validation, not preview geometry.
import { chartDisplayHost } from '../../../js/chart-display-host.mjs';
// @ts-ignore Shared exact Native OLE/frame comparison.
import { chartDisplayMatchesOle } from '../../../web/preview/chart-source-frame.mjs';
// @ts-ignore Shared ownership-proven plain title projection.
import { chartPreviewTitle } from '../../../web/preview/chart-preview-title.mjs';

export interface ChartPropertiesTarget {
  readonly section: number;
  readonly wrapper: number;
}
export interface ChartPropertiesObservation {
  readonly state: EditorState;
  readonly token: StateToken;
  readonly target: ChartPropertiesTarget;
}
export interface ChartPropertiesCapture extends ChartPropertiesObservation {
  readonly source: Readonly<{ pair: any; host: any }>;
  readonly title: Readonly<{ lines: readonly string[]; shortened: boolean }> | null;
}
export interface ChartDataEditAvailability {
  readonly enabled: boolean;
  readonly reason?: string;
}
type Editor = Pick<HeadlessEditor, 'getEditorState' | 'readResource' | 'registerStateListener'>;
const uint = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;
const stale = () => Error('차트 또는 문서 상태가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
const tokenKeys = [
  'editorId',
  'documentId',
  'generation',
  'operationRevision',
  'viewRevision',
] as const;
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
function targetCopy(value: ChartPropertiesTarget): ChartPropertiesTarget {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw stale();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(fields).length !== 2 ||
    !['section', 'wrapper'].every(
      (key) => fields[key] && 'value' in fields[key] && uint(fields[key].value),
    )
  )
    throw stale();
  return Object.freeze({
    section: fields.section.value as number,
    wrapper: fields.wrapper.value as number,
  });
}

/** Read-only current Native resources. No preview cache, write API or geometry inference. */
export function createChartPropertiesPort(editor: Editor) {
  let busy = false;
  const captures = new WeakSet<ChartPropertiesCapture>();
  function current(observation: ChartPropertiesObservation) {
    const state = editor.getEditorState();
    return (
      state === observation.state &&
      state.status === 'ready' &&
      tokenKeys.every((key) => state.token[key] === observation.token[key])
    );
  }
  function inspect(target: ChartPropertiesTarget) {
    const state = editor.getEditorState(),
      content = state.content as any;
    if (
      state.status !== 'ready' ||
      !state.documentId ||
      state.historyRecoveryRequired ||
      content?.format !== 'hwpx' ||
      content.limited === true ||
      content.chartDisplayAvailable !== true
    )
      throw Error('현재 HWPX 차트 속성을 확인할 수 없습니다.');
    const matches = (Array.isArray(content.chartTargets) ? content.chartTargets : []).filter(
      (row: any) => row?.section === target.section && row?.wrapper === target.wrapper,
    );
    const owners = (Array.isArray(content.oles) ? content.oles : []).filter(
      (row: any) => row?.section === target.section && row?.chartWrapper === target.wrapper,
    );
    const paragraphs = (Array.isArray(content.paragraphs) ? content.paragraphs : []).filter(
      (row: any) => row?.section === target.section && row?.paragraph === matches[0]?.paragraph,
    );
    if (
      matches.length !== 1 ||
      matches[0].error_name ||
      owners.length !== 1 ||
      owners[0].state !== 'located' ||
      owners[0].error ||
      owners[0].sourceError ||
      owners[0].representation !== 'chart-alternative' ||
      !uint(matches[0].paragraph) ||
      !uint(matches[0].anchorUnit) ||
      paragraphs.length !== 1 ||
      paragraphs[0].clipped ||
      paragraphs[0].text?.[matches[0].anchorUnit] !== '\ufffc' ||
      matches[0].paragraph !== owners[0].paragraph ||
      matches[0].anchorUnit !== owners[0].anchorUnit
    )
      throw stale();
    const token = Object.freeze({ ...state.token });
    const observation = Object.freeze({ state, token, target });
    if (!current(observation)) throw stale();
    return { observation, ole: owners[0], content };
  }
  return {
    subscribe: (listener: () => void) => editor.registerStateListener(listener),
    observe(target: ChartPropertiesTarget) {
      return inspect(targetCopy(target)).observation;
    },
    current(observation: ChartPropertiesObservation) {
      try {
        return (
          current(observation) &&
          inspect(observation.target).observation.state === observation.state
        );
      } catch {
        return false;
      }
    },
    async capture(observation: ChartPropertiesObservation): Promise<ChartPropertiesCapture> {
      if (busy) throw Error('차트 속성을 읽고 있습니다.');
      const initial = inspect(observation.target);
      if (!current(observation) || initial.observation.state !== observation.state) throw stale();
      busy = true;
      try {
        const reply = await editor.readResource(
          { kind: 'chart-display', ...observation.target },
          observation.token,
        );
        if (!current(observation)) throw stale();
        const chart = reply.chart as any,
          pair = chart?.pair;
        if (
          reply.error ||
          reply.kind !== 'chart-display' ||
          reply.section !== observation.target.section ||
          reply.wrapper !== observation.target.wrapper ||
          chart?.kind !== 'chart_display' ||
          !pair ||
          typeof pair.chart_path !== 'string' ||
          !pair.chart_path.length ||
          typeof pair.ole_path !== 'string' ||
          !pair.ole_path.length ||
          typeof pair.declared_external !== 'boolean' ||
          !Array.isArray(pair.section_sha256) ||
          pair.section_sha256.length !== 32 ||
          !pair.section_sha256.every((byte: unknown) => uint(byte) && byte <= 255) ||
          !chartDisplayHost(chart.host, observation.target.wrapper) ||
          !chartDisplayMatchesOle(chart, initial.ole)
        )
          throw Error('현재 Native 차트 속성과 소유 정보를 확인할 수 없습니다.');
        const projected = Array.isArray(chart.rich_text) ? chartPreviewTitle(chart).title : null;
        const capture = Object.freeze({
          ...observation,
          source: freeze(structuredClone({ pair, host: chart.host })),
          title: projected
            ? freeze(structuredClone({ lines: projected.lines, shortened: projected.shortened }))
            : null,
        });
        if (
          !current(observation) ||
          inspect(observation.target).observation.state !== observation.state
        )
          throw stale();
        captures.add(capture);
        return capture;
      } finally {
        busy = false;
      }
    },
    isCaptureCurrent(capture: ChartPropertiesCapture) {
      return captures.has(capture) && this.current(capture);
    },
  };
}
export type ChartPropertiesPort = ReturnType<typeof createChartPropertiesPort>;
