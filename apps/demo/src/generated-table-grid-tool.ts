import type { EditorState } from '@hwpjs/core';
import type { ContextTarget } from './context-menu.ts';
import {
  generatedTableGridCommands,
  generatedTableGridReason,
  type GeneratedTableGridCommand,
  type GeneratedTableGridPort,
} from './generated-table-grid-port.ts';

export function createGeneratedTableGridTool<
  Capture extends { readonly state: EditorState },
>(options: {
  root?: HTMLElement;
  port: {
    capture(): Capture;
    apply(
      lease: Capture,
      command: GeneratedTableGridCommand,
    ): ReturnType<GeneratedTableGridPort['apply']>;
    presentation: GeneratedTableGridPort['presentation'];
    contextTarget(): ContextTarget | null;
    reason?(code: string): string;
    dispose(): void;
  };
  onStatus: (message: string) => void;
  onPresentationChange: () => void;
}) {
  let pending = false,
    disposed = false;
  const events = new AbortController();
  let refreshQueued = false;
  const refresh = () => {
    if (disposed || refreshQueued) return;
    refreshQueued = true;
    // Canvas owns local selection; Core null→null need not publish a new state.
    // Run after the Canvas handler, with no selection copying or synthetic target.
    queueMicrotask(() => {
      refreshQueued = false;
      if (!disposed) options.onPresentationChange();
    });
  };
  for (const type of [
    'pointerup',
    'keydown',
    'keyup',
    'input',
    'compositionstart',
    'compositionend',
  ])
    options.root?.addEventListener(type, refresh, { capture: true, signal: events.signal });
  return {
    presentation: () => options.port.presentation(),
    contextTarget: () => options.port.contextTarget(),
    handles: (command: string): command is GeneratedTableGridCommand =>
      generatedTableGridCommands.includes(command as GeneratedTableGridCommand),
    async execute(command: GeneratedTableGridCommand) {
      if (disposed || pending) return;
      const lease = options.port.capture();
      pending = true;
      // apply synchronously admits and sets the port pending before shell refresh.
      const operation = options.port.apply(lease, command);
      options.onPresentationChange();
      try {
        const result = await operation;
        const now = options.port.capture().state;
        if (
          disposed ||
          now.editorId !== lease.state.editorId ||
          now.documentId !== lease.state.documentId ||
          now.generation !== lease.state.generation
        )
          return;
        options.onStatus(
          result.status === 'committed-with-snapshot'
            ? '표의 행·열을 변경했습니다. 셀을 다시 선택하세요.'
            : result.status.startsWith('committed')
              ? '변경은 반영됐지만 표시 확인이 필요합니다. 다시 적용하지 마세요.'
              : result.status === 'known-no-op'
                ? '표의 행·열 변경이 없습니다.'
                : (options.port.reason ?? generatedTableGridReason)(
                    typeof result.error === 'string' ? result.error : 'Failed',
                  ),
        );
      } catch {
        const now = options.port.capture().state;
        if (
          !disposed &&
          now.documentId === lease.state.documentId &&
          now.generation === lease.state.generation
        )
          options.onStatus(
            '접수된 표 변경 결과가 불확실합니다. 문서를 확인하고 다시 적용하지 마세요.',
          );
      } finally {
        pending = false;
        if (!disposed) options.onPresentationChange();
      }
    },
    dispose() {
      disposed = true;
      events.abort();
      options.port.dispose();
    },
  };
}
