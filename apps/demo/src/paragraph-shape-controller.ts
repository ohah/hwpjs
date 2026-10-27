import type { CommandResult } from '@hwpjs/core';
import {
  createParagraphShapePort,
  type ParagraphShapeApi,
  type ParagraphShapeState,
  type ParagraphShapeValue,
} from './paragraph-shape-port.ts';
export interface ParagraphShapePresentation {
  readonly captured?: Awaited<ReturnType<ReturnType<typeof createParagraphShapePort>['read']>>;
  readonly draft: ReadonlyMap<string, ParagraphShapeValue>;
  readonly pending: boolean;
  readonly loading: boolean;
  readonly stale: boolean;
  readonly refreshRequired: boolean;
  readonly error: string | null;
}
export interface ParagraphShapeView {
  update(value: ParagraphShapePresentation): void;
  isComposing(): boolean;
  dispose(): void;
}
interface Options {
  api: ParagraphShapeApi;
  getState(): ParagraphShapeState;
  subscribe(listener: (state: ParagraphShapeState) => void): () => void;
  createView(callbacks: {
    field(name: string, value: ParagraphShapeValue | undefined): void;
    apply(): void;
    cancel(): void;
  }): ParagraphShapeView;
  onResult?(result: CommandResult): void;
  onUnavailable?(reason: string): void;
  onClose?(): void;
  onPresentationChange?(): void;
  onUIError?(error: unknown): void;
}
interface Context {
  state: ParagraphShapeState;
  captured?: ParagraphShapePresentation['captured'];
  draft: Map<string, ParagraphShapeValue>;
  loading: boolean;
  pending: boolean;
  refreshRequired: boolean;
  error: string | null;
  view?: ParagraphShapeView;
}
export function createParagraphShapeController(o: Options) {
  const port = createParagraphShapePort(o.api);
  let context: Context | undefined,
    disposed = false;
  const notify = (fn?: () => void) => {
    try {
      fn?.();
    } catch (e) {
      try {
        o.onUIError?.(e);
      } catch {
        /* 결과는 Native 실패로 바꾸지 않는다. */
      }
    }
  };
  const active = (c: Context) => !disposed && context === c;
  const sameDoc = (c: Context) => {
    const s = o.getState();
    return s.documentId === c.state.documentId && s.generation === c.state.generation;
  };
  const render = (c: Context) => {
    if (active(c))
      notify(() =>
        c.view?.update({
          captured: c.captured,
          draft: c.draft,
          loading: c.loading,
          pending: c.pending,
          refreshRequired: c.refreshRequired,
          stale: o.getState() !== c.state,
          error: c.error,
        }),
      );
  };
  const sameRange = (c: Context) => {
    const latest = o.getState().selection as Partial<
      NonNullable<Context['captured']>['target']
    > | null;
    const target = c.captured?.target;
    return (
      !!latest &&
      !!target &&
      latest.owner === target.owner &&
      latest.section === target.section &&
      latest.paragraph === target.paragraph &&
      latest.startUnit === target.startUnit &&
      latest.endUnit === target.endUnit
    );
  };
  const close = (restore: boolean) => {
    const old = context;
    context = undefined;
    if (!old) return;
    notify(() => old?.view?.dispose());
    if (
      !disposed &&
      !context &&
      restore &&
      old &&
      sameDoc(old) &&
      o.getState().status === 'ready' &&
      sameRange(old)
    )
      notify(o.onClose);
    if (!disposed) notify(o.onPresentationChange);
  };
  const apply = async (c: Context) => {
    if (
      !active(c) ||
      c.loading ||
      c.pending ||
      c.refreshRequired ||
      c.view?.isComposing() ||
      !c.captured
    )
      return;
    if (o.getState() !== c.state) {
      c.error = 'StaleParagraphShape';
      render(c);
      return;
    }
    c.pending = true;
    render(c);
    notify(o.onPresentationChange);
    try {
      const request = port.apply(c.captured, o.getState(), c.draft);
      if (!request) {
        close(true);
        return;
      }
      const result = await request;
      if (!active(c)) return;
      if (result.status === 'committed-refresh-required') {
        c.refreshRequired = true;
        c.error = '적용 결과를 다시 확인해주세요.';
      }
      notify(() => o.onResult?.(result));
      if (!active(c)) return;
      if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op')
        close(true);
      else if (!c.refreshRequired) c.error = result.error ?? result.status;
    } catch (e) {
      if (active(c)) c.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (active(c)) {
        c.pending = false;
        render(c);
        notify(o.onPresentationChange);
      }
    }
  };
  const unsubscribe = o.subscribe((s) => {
    const c = context;
    if (!c || disposed) return;
    if (!sameDoc(c) || s.status === 'loading' || s.status === 'disposed') {
      close(false);
      return;
    }
    render(c);
  });
  return {
    open() {
      if (disposed || context || o.getState().status !== 'ready') return false;
      const c: Context = {
        state: o.getState(),
        draft: new Map(),
        loading: true,
        pending: false,
        refreshRequired: false,
        error: null,
      };
      context = c;
      try {
        c.view = o.createView({
          field(name, value) {
            if (
              !active(c) ||
              c.pending ||
              c.loading ||
              c.refreshRequired ||
              o.getState() !== c.state
            )
              return;
            const observed = c.captured?.result.observations.aggregate[name];
            if (
              value === undefined ||
              (observed?.state === 'known' && Object.is(observed.value, value))
            )
              c.draft.delete(name);
            else c.draft.set(name, value);
            render(c);
          },
          apply() {
            void apply(c);
          },
          cancel() {
            if (active(c) && !c.pending && !c.view?.isComposing()) close(true);
          },
        });
      } catch (error) {
        context = undefined;
        notify(() => o.onUIError?.(error));
        notify(o.onPresentationChange);
        return false;
      }
      render(c);
      notify(o.onPresentationChange);
      void port
        .read(c.state, o.getState)
        .then(
          (value) => {
            if (active(c) && o.getState() === c.state) c.captured = value;
          },
          (e) => {
            if (active(c)) {
              const reason = e instanceof Error ? e.message : String(e);
              if (
                reason === 'AtomicFormattingUnavailable' &&
                o.onUnavailable &&
                o.getState() === c.state
              ) {
                close(false);
                notify(() => o.onUnavailable?.(reason));
                return;
              }
              c.error = reason;
            }
          },
        )
        .finally(() => {
          if (active(c)) {
            c.loading = false;
            render(c);
            notify(o.onPresentationChange);
          }
        });
      return true;
    },
    presentation() {
      return {
        open: !!context,
        loading: context?.loading ?? false,
        pending: context?.pending ?? false,
        stale: !!context && o.getState() !== context.state,
        refreshRequired: context?.refreshRequired ?? false,
      };
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        notify(unsubscribe);
        close(false);
      }
    },
  };
}
