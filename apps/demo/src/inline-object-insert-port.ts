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
export interface InlineObjectInsertCore {
  INSERT_EQUATION_COMMAND: EditorCommand<InsertEquationPayload>;
  CREATE_CHART_COMMAND: EditorCommand<CreateChartPayload>;
  getInlineObjectInsertAvailability(
    state: EditorState,
    kind: InlineObjectKind,
  ): { enabled: boolean; reason?: string };
}
type Editor = Pick<HeadlessEditor, 'getEditorState' | 'dispatchCommand' | 'registerStateListener'>;
export interface InlineObjectInsertCapture {
  readonly state: EditorState;
  readonly kind: InlineObjectKind;
}
export function createInlineObjectInsertPort(
  editor: Editor,
  core: Partial<InlineObjectInsertCore>,
) {
  let busy = false;
  const captures = new WeakSet<InlineObjectInsertCapture>();
  const inspect = (kind: InlineObjectKind) => {
    if (busy) return { enabled: false, reason: '삽입 처리 중입니다.' };
    if (
      !core.getInlineObjectInsertAvailability ||
      !(kind === 'equation' ? core.INSERT_EQUATION_COMMAND : core.CREATE_CHART_COMMAND)
    )
      return { enabled: false, reason: '새 개체 삽입 SDK가 연결되지 않았습니다.' };
    const result = core.getInlineObjectInsertAvailability(editor.getEditorState(), kind);
    if (result.enabled) return result;
    const reasons: Record<string, string> = {
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
        'HWPX 첫 구역의 일반 본문에서 선택 영역 없이 커서를 놓아주세요.',
    };
  };
  return {
    subscribe: (listener: () => void) => editor.registerStateListener(listener),
    presentation: inspect,
    capture(kind: InlineObjectKind): InlineObjectInsertCapture {
      const initial = editor.getEditorState();
      const availability = inspect(kind);
      if (!availability.enabled) throw Error(availability.reason);
      if (editor.getEditorState() !== initial) throw Error('StaleInlineObjectInsert');
      const capture = Object.freeze({ state: initial, kind });
      captures.add(capture);
      return capture;
    },
    current(capture: InlineObjectInsertCapture) {
      return (
        captures.has(capture) &&
        capture.state === editor.getEditorState() &&
        inspect(capture.kind).enabled
      );
    },
    async insert(
      capture: InlineObjectInsertCapture,
      options: EquationInsertOptions | ChartCreateOptions,
    ): Promise<CommandResult> {
      if (busy || !captures.has(capture) || capture.state !== editor.getEditorState())
        throw Error('StaleInlineObjectInsert');
      const availability = inspect(capture.kind);
      if (!availability.enabled) throw Error(availability.reason);
      captures.delete(capture); // Each capture permits at most one dispatch, including unknown results.
      busy = true;
      try {
        const payload = {
          target: capture.state.selection as SelectionTarget,
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
