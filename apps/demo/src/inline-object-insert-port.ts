import type { Hwp5ChartCreatePreviewCore } from './hwp5-chart-create-preview-port.ts';
import type { Hwp5ChartCreateOptions } from '../../../js/hwp5-chart-create.mjs';
import type {
  HeadlessEditor,
  EditorState,
  EditorCommand,
  SelectionTarget,
  CommandResult,
} from '@hwpjs/core';
import type {
  InlineObjectKind,
  InsertEquationPayload,
  CreateChartPayload,
  EquationInsertOptions,
  ChartCreateOptions,
} from '../../../packages/core/src/commands/inline-object-insert.ts';
import {
  captureInlineObjectCreateTarget,
  type InlineObjectCreateTarget,
} from '../../../packages/core/src/commands/inline-object-owner.ts';
import type { InlineObjectSelector } from '../../../js/hwpx-inline-object-placement.mjs';
export interface InlineObjectCaretCapture {
  readonly state: EditorState;
  readonly selector: InlineObjectSelector;
  readonly unit: number;
  readonly affinity?: 'forward' | 'backward';
  readonly expected_text: string;
  current(): boolean;
}
export interface InlineObjectInsertCore {
  INSERT_EQUATION_COMMAND: EditorCommand<InsertEquationPayload>;
  CREATE_CHART_COMMAND: EditorCommand<CreateChartPayload>;
  hwp5ChartCreatePreviewMessage?: Hwp5ChartCreatePreviewCore['hwp5ChartCreatePreviewMessage'];
  getInlineObjectInsertAvailability(
    state: EditorState,
    kind: InlineObjectKind,
    chart?: undefined,
    target?: InlineObjectCreateTarget,
  ): { enabled: boolean; reason?: string };
}
type Editor = Pick<
  HeadlessEditor,
  'getEditorState' | 'dispatchCommand' | 'registerStateListener'
> & {
  readResource?: HeadlessEditor['readResource'];
  getInlineObjectInsertTarget?(
    selector: InlineObjectSelector,
    unit: number,
    options?: { affinity?: 'forward' | 'backward' },
  ): Promise<InlineObjectCreateTarget>;
};
export interface InlineObjectInsertCapture {
  readonly state: EditorState;
  readonly kind: InlineObjectKind;
  readonly target?: InlineObjectCreateTarget;
  readonly caretCurrent?: () => boolean;
}
export function createInlineObjectInsertPort(
  editor: Editor,
  core: Partial<InlineObjectInsertCore>,
  captureCaret?: () => InlineObjectCaretCapture | null,
) {
  let busy = false;
  let activeCapture: InlineObjectInsertCapture | undefined;
  const captures = new WeakSet<InlineObjectInsertCapture>();
  const inspect = (kind: InlineObjectKind) => {
    if (busy) return { enabled: false, reason: '삽입 처리 중입니다.' };
    if (
      !core.getInlineObjectInsertAvailability ||
      !(kind === 'equation' ? core.INSERT_EQUATION_COMMAND : core.CREATE_CHART_COMMAND)
    )
      return { enabled: false, reason: '새 개체 삽입 SDK가 연결되지 않았습니다.' };
    const observed = editor.getEditorState();
    const hwp5Chart = kind === 'chart' && (observed.content as Record<string, unknown> | undefined)?.format === 'hwp5';
    if (
      hwp5Chart &&
      (!core.hwp5ChartCreatePreviewMessage ||
        !editor.readResource ||
        (observed.content as Record<string, unknown> | undefined)?.hwp5ChartCreateProfileVersion !== 1 ||
        !captureCaret ||
        captureCaret()?.current() !== true)
    )
      return {
        enabled: false,
        reason: '현재 HWP5 차트 생성과 본문 커서 연결을 확인할 수 없습니다.',
      };
    const result = core.getInlineObjectInsertAvailability(observed, kind);
    if (result.enabled) return result;
    const state = editor.getEditorState(),
      content = state.content as Record<string, unknown> | undefined;
    // This permits asking Native for a target, not writing without proof.
    if (
      !(kind === 'chart' && content?.format === 'hwp5') &&
      captureCaret &&
      editor.getInlineObjectInsertTarget &&
      content?.inlineObjectPlacementVersion === 1 &&
      state.status === 'ready' &&
      !state.historyRecoveryRequired &&
      content.readOnly !== true &&
      (state.capabilities as any)?.readOnly !== true &&
      content.limited !== true &&
      !content.window &&
      state.nativeHistoryStats?.protocolVersion === 2 &&
      Number.isSafeInteger(state.nativeHistoryRevision) &&
      content[kind === 'chart' ? 'chartCreationAvailable' : 'equationInsertionAvailable'] ===
        true &&
      captureCaret()?.current() === true
    )
      return { enabled: true };
    const reasons: Record<string, string> = {
      ChartCreateProfileUnavailable: '현재 엔진은 선택한 차트 종류 생성을 지원하지 않습니다.',
      InlineObjectPlacementUnavailable:
        '현재 엔진에서 표 셀·구역 대상의 소유권 검증 지원이 확인되지 않았습니다.',
      InlineObjectOwnerRequired:
        '현재 위치는 Native 소유권 조회가 연결된 새 엔진에서 사용할 수 있습니다.',
      InlineObjectInsertionUnavailable:
        '현재 엔진에서 새 개체 생성 지원이 확인되지 않았습니다. 구형 엔진에서는 사용할 수 없습니다.',
      HistoryNotEnabled: '편집 이력 지원이 확인되지 않아 새 개체를 생성할 수 없습니다.',
      EditorNotReady: '문서를 연 뒤 편집 준비가 끝나면 사용할 수 있습니다.',
      HistoryRecoveryRequired: '편집 이력을 복구한 뒤 다시 시도하세요.',
      ReadOnlyDocument: '읽기 전용 문서에는 삽입할 수 없습니다.',
      InlineObjectRequiresFullDocument: '문서 전체가 열린 상태에서 사용할 수 있습니다.',
    };
    return {
      enabled: false,
      reason:
        reasons[result.reason ?? ''] ??
        'HWP5 본문 또는 HWPX 본문·표 셀의 편집 가능한 위치에 선택 영역 없이 커서를 놓아주세요.',
    };
  };
  return {
    subscribe: (listener: () => void) => editor.registerStateListener(listener),
    presentation: inspect,
    chartCreateProfileVersion() {
      const state = editor.getEditorState();
      return ((activeCapture?.state === state && activeCapture.caretCurrent?.() === true) ||
        inspect('chart').enabled) &&
        (state.content as Record<string, unknown> | undefined)?.chartCreateProfileVersion === 1
        ? 1
        : 0;
    },
    capture(kind: InlineObjectKind): InlineObjectInsertCapture {
      const initial = editor.getEditorState();
      const availability = inspect(kind);
      if (!availability.enabled) throw Error(availability.reason);
      if (editor.getEditorState() !== initial) throw Error('StaleInlineObjectInsert');
      const caret =
        kind === 'chart' && (initial.content as Record<string, unknown> | undefined)?.format === 'hwp5' ? captureCaret?.() : null;
      if (kind === 'chart' && (initial.content as Record<string, unknown> | undefined)?.format === 'hwp5') {
        const target = initial.selection as SelectionTarget | null;
        const rows = (initial.content as Record<string, unknown> | undefined)?.paragraphs;
        const row = Array.isArray(rows) ? rows.find((p: unknown): p is Record<string, unknown> =>
          p !== null && typeof p === 'object' && 'section' in p && 'paragraph' in p &&
          p.section === target?.section && p.paragraph === target?.paragraph) : undefined;
        if (
          !caret ||
          caret.state !== initial ||
          !caret.current() ||
          !target ||
          target.startUnit !== target.endUnit ||
          caret.unit !== target.startUnit ||
          caret.selector.section !== target.section ||
          !('paragraph' in caret.selector) ||
          caret.selector.paragraph !== target.paragraph + 1 ||
          caret.expected_text !== row?.text
        )
          throw Error('StaleInlineObjectInsert');
      }
      const capture = Object.freeze({
        state: initial,
        kind,
        ...(caret ? { caretCurrent: () => caret.current() } : {}),
      });
      captures.add(capture);
      return capture;
    },
    async captureAtCaret(kind: InlineObjectKind): Promise<InlineObjectInsertCapture> {
      const initial = editor.getEditorState();
      // Preserve the actual existing section0 body/default wire, even when the
      // newer placement query is available. Explicit owner targets opt in.
      if (core.getInlineObjectInsertAvailability?.(initial, kind).enabled)
        return this.capture(kind);
      const caret = captureCaret?.();
      if (
        !caret ||
        !editor.getInlineObjectInsertTarget ||
        (initial.content as any)?.inlineObjectPlacementVersion !== 1
      )
        return this.capture(kind);
      if (caret.state !== initial || !caret.current()) throw Error('StaleInlineObjectInsert');
      const observed = await editor.getInlineObjectInsertTarget(caret.selector, caret.unit, {
        affinity: caret.affinity ?? 'forward',
      });
      const target = captureInlineObjectCreateTarget(observed);
      if (
        editor.getEditorState() !== initial ||
        !caret.current() ||
        target.address.expected_text !== caret.expected_text ||
        target.address.unit !== caret.unit ||
        (target.address.affinity ?? 'forward') !== (caret.affinity ?? 'forward')
      )
        throw Error('StaleInlineObjectInsert');
      const availability = core.getInlineObjectInsertAvailability?.(
        initial,
        kind,
        undefined,
        target,
      );
      if (!availability?.enabled)
        throw Error(availability?.reason ?? 'InlineObjectInsertionUnavailable');
      const capture = Object.freeze({
        state: initial,
        kind,
        target,
        caretCurrent: () => caret.current(),
      });
      captures.add(capture);
      activeCapture = capture;
      return capture;
    },
    current(capture: InlineObjectInsertCapture) {
      return (
        captures.has(capture) &&
        capture.state === editor.getEditorState() &&
        (capture.caretCurrent ? capture.caretCurrent() === true : inspect(capture.kind).enabled)
      );
    },
    async insert(
      capture: InlineObjectInsertCapture,
      options: EquationInsertOptions | ChartCreateOptions | Hwp5ChartCreateOptions,
    ): Promise<CommandResult> {
      if (busy || !captures.has(capture) || capture.state !== editor.getEditorState())
        throw Error('StaleInlineObjectInsert');
      const availability = capture.target
        ? core.getInlineObjectInsertAvailability?.(
            capture.state,
            capture.kind,
            undefined,
            capture.target,
          )
        : capture.caretCurrent
          ? core.getInlineObjectInsertAvailability?.(capture.state, capture.kind)
          : inspect(capture.kind);
      if (capture.caretCurrent && !capture.caretCurrent()) throw Error('StaleInlineObjectInsert');
      if (!availability?.enabled)
        throw Error(availability?.reason ?? 'InlineObjectInsertionUnavailable');
      captures.delete(capture); // Each capture permits at most one dispatch, including unknown results.
      busy = true;
      try {
        const payload = {
          target: capture.target ?? (capture.state.selection as SelectionTarget),
          selectionVersion: capture.state.stateVersion,
          options,
        };
        return capture.kind === 'equation'
          ? await editor.dispatchCommand(
              core.INSERT_EQUATION_COMMAND!,
              payload as InsertEquationPayload,
            )
          : await editor.dispatchCommand(core.CREATE_CHART_COMMAND!, payload as CreateChartPayload);
      } finally {
        busy = false;
      }
    },
  };
}
export type InlineObjectInsertPort = ReturnType<typeof createInlineObjectInsertPort>;
