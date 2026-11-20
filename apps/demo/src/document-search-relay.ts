import type {
  DocumentSearchSelectionPort,
  DocumentSearchCaretPort,
} from './document-search-controller.ts';

// React/Svelte can replace a Surface during mounting. Its delayed confirmation
// cannot be used by the successor Surface, even when document text is identical.
export function createDocumentSearchRelay() {
  let surface:
    | {
        selectDocumentText: DocumentSearchSelectionPort;
        captureDocumentTextCaret?: DocumentSearchCaretPort;
        prepareDocumentTextReadView?: (
          current: () => boolean,
        ) => Promise<'current' | 'refreshed' | 'unavailable'>;
      }
    | undefined;
  let epoch = 0,
    disposed = false;
  return {
    connect(next: {
      selectDocumentText: DocumentSearchSelectionPort;
      captureDocumentTextCaret?: DocumentSearchCaretPort;
      prepareDocumentTextReadView?: (
        current: () => boolean,
      ) => Promise<'current' | 'refreshed' | 'unavailable'>;
    }) {
      if (disposed) return;
      epoch++;
      surface = next;
    },
    async prepareRead(current: () => boolean) {
      const captured = surface,
        version = epoch;
      const active = () => !disposed && surface === captured && version === epoch && current();
      if (!captured || !active()) return 'unavailable' as const;
      const result = (await captured.prepareDocumentTextReadView?.(active)) ?? 'current';
      return active() ? result : ('unavailable' as const);
    },
    captureCaret(): ReturnType<DocumentSearchCaretPort> {
      const captured = surface,
        version = epoch;
      if (disposed || !captured)
        return { status: 'unavailable', reason: 'DocumentSearchCaretUnavailable' };
      const read = captured.captureDocumentTextCaret?.() ?? { status: 'none' as const };
      if (read.status !== 'captured') return read;
      const capture = read.capture;
      return {
        status: 'captured',
        capture: {
          ...capture,
          current: () =>
            !disposed && surface === captured && version === epoch && capture.current(),
        },
      };
    },
    async select(
      ...args: Parameters<DocumentSearchSelectionPort>
    ): ReturnType<DocumentSearchSelectionPort> {
      const captured = surface,
        version = epoch;
      if (disposed || !captured) return null;
      const current = () => !disposed && surface === captured && version === epoch && args[1]();
      if (!current()) return null;
      const result = await captured.selectDocumentText(args[0], current, args[2]);
      return current() ? result : null;
    },
    dispose() {
      disposed = true;
      epoch++;
      surface = undefined;
    },
  };
}
