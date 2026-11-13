import type { HeadlessEditor, RuntimeMessage, RuntimeReply } from '@hwpjs/core';

type Editor = Pick<
  HeadlessEditor,
  'getEditorState' | 'readResource' | 'requestExperimental' | 'registerStateListener'
>;
type State = ReturnType<Editor['getEditorState']>;
const uint = (v: unknown): v is number =>
  Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 0xffffffff;
export function equationAvailability(state: State) {
  const caps = state.capabilities as Record<string, unknown> | undefined;
  const content = state.content as Record<string, unknown> | undefined;
  const reason =
    state.status !== 'ready' || state.historyRecoveryRequired
      ? '문서를 열고 편집 이력과 표시 상태를 확인해주세요.'
      : caps?.readOnly === true || content?.readOnly === true
        ? '읽기 전용 문서입니다.'
        : content?.format !== 'hwpx' || content?.limited === true
          ? '기존 HWPX 수식 script만 편집할 수 있습니다.'
          : caps?.equationScriptAvailable !== true ||
              !uint(caps.equationSectionCount) ||
              caps.equationSectionCount === 0
            ? '현재 엔진은 기존 수식 script 편집을 제공하지 않습니다.'
            : null;
  return {
    enabled: reason === null,
    reason,
    sectionCount: reason ? 0 : Number(caps!.equationSectionCount),
  };
}

/** One dialog lifetime. Core owns document authority; the reused controls own drafts/revisions. */
export function createEquationPort(
  editor: Editor,
  options: {
    receive(message: RuntimeReply): void;
    invalidate(reason: string): void;
  },
) {
  let state = editor.getEditorState(),
    closed = false,
    writing = false,
    pending = false;
  const current = () =>
    !closed && editor.getEditorState() === state && equationAvailability(state).enabled;
  function invalidate(reason: string) {
    if (closed) return;
    closed = true;
    unsubscribe();
    options.invalidate(reason);
  }
  const unsubscribe = editor.registerStateListener(() => {
    // Core publishes the write snapshot before resolving its CommandResult.
    // Settle against that exact result.state, never merely the newest token.
    if (!writing && !current())
      invalidate('문서 상태가 바뀌었습니다. 수식 편집을 다시 열어주세요.');
  });
  return {
    ready: current,
    enable() {
      if (!current()) return false;
      const caps = equationAvailability(state);
      options.receive({
        kind: 'enable',
        equationScriptAvailable: true,
        equationSectionCount: caps.sectionCount,
        content: state.content,
      });
      return true;
    },
    request(input: RuntimeMessage) {
      if (!current() || pending) return false;
      const message = { ...input };
      const mutation = message.kind === 'equation-script-set';
      if (
        !['equation-sources', 'equation-script-query', 'equation-script-set'].includes(
          message.kind,
        ) ||
        !uint(message.requestId) ||
        !uint(message.section) ||
        message.section >= equationAvailability(state).sectionCount ||
        (message.kind !== 'equation-sources' && !uint(message.node)) ||
        (mutation &&
          (typeof message.before !== 'string' ||
            typeof message.value !== 'string' ||
            !uint(message.expectedRevision)))
      )
        return false;
      const captured = state,
        token = state.token;
      const read = editor.readResource.bind(editor),
        write = editor.requestExperimental.bind(editor);
      if (!current()) return false;
      pending = true;
      // The old controls set pending='write' AFTER request() returns.
      // Defer even synchronous failures so they see a matching pending request.
      queueMicrotask(async () => {
        if (!current()) {
          pending = false;
          return;
        }
        writing = mutation;
        try {
          const result = await (mutation
            ? write(message, { mutation: true, token })
            : read(message, { token }));
          if (closed) return;
          let reply: RuntimeReply;
          if (mutation) {
            const command = result as {
              status?: string;
              state?: State;
              reply?: RuntimeReply;
              error?: string;
            };
            if (command.status === 'committed-refresh-required') {
              invalidate(
                '수식 변경 결과의 표시 확인이 필요합니다. 다시 적용하지 말고 문서를 확인하세요.',
              );
              return;
            }
            if (
              !['committed-with-snapshot', 'known-no-op', 'rejected-unapplied'].includes(
                command.status ?? '',
              ) ||
              !command.state ||
              command.state !== editor.getEditorState() ||
              command.state.editorId !== captured.editorId ||
              command.state.documentId !== captured.documentId ||
              command.state.generation !== captured.generation ||
              !equationAvailability(command.state).enabled
            ) {
              invalidate('수식 변경 뒤 문서 상태를 확인할 수 없습니다. 문서를 확인하세요.');
              return;
            }
            state = command.state;
            if (command.status !== 'rejected-unapplied' && !command.reply) {
              invalidate('수식 변경 후 현재값을 확인할 수 없습니다. 문서를 확인하세요.');
              return;
            }
            reply = command.reply ?? {
              ...message,
              error: command.error ?? 'UnexpectedEquationResult',
            };
          } else {
            if (!current()) {
              invalidate('조회 중 문서가 바뀌었습니다. 수식 편집을 다시 열어주세요.');
              return;
            }
            reply = result as RuntimeReply;
          }
          if (
            reply.kind !== message.kind ||
            reply.requestId !== message.requestId ||
            reply.section !== message.section ||
            (message.kind !== 'equation-sources' && reply.node !== message.node)
          )
            throw Error('MismatchedEquationReply');
          if (!reply.error && message.kind !== 'equation-sources') {
            const equation = reply.equation as Record<string, unknown> | undefined;
            if (
              !equation ||
              equation.section !== message.section ||
              equation.node !== message.node ||
              typeof equation.value !== 'string' ||
              !uint(equation.revision)
            )
              throw Error('InvalidEquationReply');
          }
          pending = false;
          options.receive(reply);
        } catch (error) {
          if (closed) return;
          if (!current()) {
            invalidate('수식 처리 중 문서가 바뀌었습니다. 문서를 확인하세요.');
            return;
          }
          pending = false;
          // A write transport failure is not proof that Native did not apply.
          if (mutation) {
            invalidate(
              '수식 변경 결과를 확인할 수 없습니다. 다시 적용하지 말고 문서를 확인하세요.',
            );
            return;
          }
          options.receive({
            ...message,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          writing = false;
        }
      });
      return true;
    },
    close() {
      if (!closed) {
        closed = true;
        unsubscribe();
      }
    },
  };
}
