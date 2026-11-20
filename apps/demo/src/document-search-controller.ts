import type {
  HeadlessEditor,
  DocumentTextIndex,
  DocumentTextMatch,
  DocumentTextSelectionObservation,
  DocumentTextCaretPoint,
  findDocumentTextMatch,
} from '@hwpjs/core';

type State = ReturnType<HeadlessEditor['getEditorState']>;
export type DocumentSearchSelectionPort = (
  observation: DocumentTextSelectionObservation,
  current: () => boolean,
  match?: DocumentTextMatch,
) => Promise<{ readonly state: State; readonly status?: 'revealed' } | null>;
export type DocumentSearchCaretPort = () =>
  | { readonly status: 'none' }
  | { readonly status: 'unavailable'; readonly reason: string }
  | {
      readonly status: 'captured';
      readonly capture: {
        readonly state: State;
        readonly anchor: DocumentTextCaretPoint;
        readonly focus: DocumentTextCaretPoint;
        current(): boolean;
      };
    };
export type DocumentSearchResult =
  | { readonly status: 'selected'; readonly match: DocumentTextMatch; readonly state: State }
  | { readonly status: 'not-found' | 'edge' | 'cancelled' | 'busy' };
export interface DocumentSearchRequest {
  readonly query: string;
  readonly direction?: 'forward' | 'backward';
  readonly wrap?: boolean;
  readonly current?: () => boolean;
}
/** UI lifecycle only. Complete Native observation and literal matching remain
 * Core-owned; painted-owner selection remains the current Surface's job. */
export function createDocumentSearchController({
  editor,
  findMatch,
  select,
  getCaret,
  prepareRead,
}: {
  editor: Pick<
    HeadlessEditor,
    | 'getEditorState'
    | 'getDocumentTextSnapshot'
    | 'getDocumentTextSelection'
    | 'registerStateListener'
    | 'update'
  > &
    Partial<Pick<HeadlessEditor, 'getDocumentTextAnchor'>>;
  findMatch: typeof findDocumentTextMatch;
  select: DocumentSearchSelectionPort;
  getCaret?: DocumentSearchCaretPort;
  prepareRead?: (current: () => boolean) => Promise<'current' | 'refreshed' | 'unavailable'>;
}) {
  let disposed = false,
    pending = false,
    epoch = 0;
  let cursor: { state: State; query: string; match: DocumentTextMatch } | undefined;
  let previous = editor.getEditorState();
  const reset = () => {
    epoch++;
    cursor = undefined;
  };
  const unsubscribe = editor.registerStateListener((state) => {
    if (
      state.status !== 'ready' ||
      state.documentId !== previous.documentId ||
      state.generation !== previous.generation ||
      state.operationRevision !== previous.operationRevision ||
      state.nativeHistoryRevision !== previous.nativeHistoryRevision
    )
      cursor = undefined;
    previous = state;
  });
  return {
    reset,
    async find(input: DocumentSearchRequest): Promise<DocumentSearchResult> {
      if (disposed) return { status: 'cancelled' };
      if (pending) return { status: 'busy' };
      if (
        typeof input?.query !== 'string' ||
        !input.query ||
        (input.direction !== undefined && !['forward', 'backward'].includes(input.direction)) ||
        (input.wrap !== undefined && typeof input.wrap !== 'boolean')
      )
        throw Error('InvalidSearchQuery');
      const query = input.query,
        direction = input.direction ?? 'forward',
        wrap = input.wrap !== false;
      const current = input.current ?? (() => true);
      const observedEpoch = epoch;
      const initial = editor.getEditorState();
      let fence: State | undefined;
      const active = () => {
        if (disposed || epoch !== observedEpoch || !current()) return false;
        const state = editor.getEditorState();
        return (
          state.status === 'ready' &&
          state.documentId === initial.documentId &&
          state.generation === initial.generation &&
          (!fence ||
            (state.operationRevision === fence.operationRevision &&
              state.nativeHistoryRevision === fence.nativeHistoryRevision))
        );
      };
      pending = true;
      try {
        // Reuse the editor's existing input barrier before taking a new complete
        // Native observation; there is no per-hit edit queue or display fallback.
        await editor.update(() => {});
        if (!active()) return { status: 'cancelled' };
        const prepared = await prepareRead?.(active);
        if (!active()) return { status: 'cancelled' };
        if (prepared === 'unavailable') throw Error('DocumentSearchCaretUnavailable');
        const state = editor.getEditorState();
        fence = state;
        let anchor: { ref: string; startUnit: number; endUnit: number } | undefined =
          cursor?.state === state && cursor.query === query ? cursor.match : undefined;
        // Reveal is a view transition. Re-observe in the new view before selection.
        for (let revealAttempt = 0; revealAttempt < 2; revealAttempt++) {
          const observed = editor.getEditorState();
          const index: DocumentTextIndex = await editor.getDocumentTextSnapshot({
            token: observed.token,
          });
          if (!active()) return { status: 'cancelled' };
          if (!anchor && revealAttempt === 0 && getCaret) {
            const read = getCaret();
            if (read.status === 'unavailable') throw Error(read.reason);
            if (read.status === 'captured') {
              const capture = read.capture;
              if (capture.state !== observed || !capture.current()) return { status: 'cancelled' };
              const resolve = editor.getDocumentTextAnchor;
              if (!resolve) throw Error('DocumentTextAnchorUnavailable');
              const left = await resolve(index, capture.anchor);
              if (!active() || !capture.current()) return { status: 'cancelled' };
              const right = await resolve(index, capture.focus);
              if (!active() || !capture.current()) return { status: 'cancelled' };
              const order = left.ordinal - right.ordinal || left.startUnit - right.startUnit;
              const from =
                direction === 'forward' ? (order > 0 ? left : right) : order < 0 ? left : right;
              anchor = { ref: from.ref, startUnit: from.startUnit, endUnit: from.endUnit };
            }
          }
          const options = {
            direction,
            wrap,
            ...(anchor
              ? {
                  anchor: {
                    ref: anchor.ref,
                    startUnit: anchor.startUnit,
                    endUnit: anchor.endUnit,
                  },
                }
              : {}),
          };
          const match = findMatch(index, query, options);
          if (!match)
            return {
              status:
                !wrap && findMatch(index, query, { ...options, wrap: true }) ? 'edge' : 'not-found',
            };
          const observation = await editor.getDocumentTextSelection(index, match);
          if (!active()) return { status: 'cancelled' };
          const receipt = await select(observation, active, match);
          if (!active()) return { status: 'cancelled' };
          if (!receipt) throw Error('DocumentSearchSelectionUnavailable');
          if (receipt.status === 'revealed') {
            if (revealAttempt !== 0) throw Error('DocumentSearchSelectionUnavailable');
            continue;
          }
          await editor.update(() => {});
          if (!active() || editor.getEditorState() !== receipt.state)
            return { status: 'cancelled' };
          cursor = { state: receipt.state, query, match };
          return { status: 'selected', match, state: receipt.state };
        }
        throw Error('DocumentSearchSelectionUnavailable');
      } finally {
        pending = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      unsubscribe();
    },
  };
}
