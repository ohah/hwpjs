import type { ChartCapture, ChartDataPort, ChartTarget } from './chart-data-port.ts';

export interface ChartDataView {
  focus(): void;
  destroy(): void;
  setBusy(busy: boolean): void;
  setStatus(text: string): void;
  showCapture(capture: ChartCapture | null): void;
  invalidate(): void;
}
export type ChartDataViewFactory = (
  targets: readonly ChartTarget[],
  callbacks: {
    onSelect(target: ChartTarget): void;
    onApply(values: readonly string[]): void;
    onDismiss(): void;
  },
) => ChartDataView;

export function createChartDataController(options: {
  port: ChartDataPort;
  createView: ChartDataViewFactory;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange?(): void;
}) {
  let disposed = false,
    pending = false,
    epoch = 0;
  let session:
    | {
        view: ChartDataView;
        capture: ChartCapture | null;
        state: ReturnType<ChartDataPort['getState']>;
      }
    | undefined;
  const sameDocument = (
    a: ReturnType<ChartDataPort['getState']>,
    b: ReturnType<ChartDataPort['getState']>,
  ) => a.editorId === b.editorId && a.documentId === b.documentId && a.generation === b.generation;
  const notify = (callback: () => void) => {
    try {
      callback();
    } catch {
      /* UI failure cannot undo a commit. */
    }
  };
  const changed = () => notify(() => options.onPresentationChange?.());
  function close(restore = false) {
    epoch++;
    const old = session;
    session = undefined;
    old?.view.destroy();
    const latest = options.port.getState();
    if (
      restore &&
      old &&
      !disposed &&
      !pending &&
      latest.status === 'ready' &&
      sameDocument(old.state, latest)
    )
      notify(options.onClose);
  }
  async function select(target: ChartTarget) {
    const current = session;
    if (!current || disposed || pending) return;
    const ticket = ++epoch;
    pending = true;
    current.capture = null;
    current.view.showCapture(null);
    current.view.setBusy(true);
    changed();
    try {
      if (disposed || current !== session || ticket !== epoch) return;
      const capture = await options.port.capture(target);
      if (disposed || current !== session || ticket !== epoch) return;
      if (!options.port.current(capture)) throw Error('문서가 바뀌었습니다. 창을 다시 열어주세요.');
      current.capture = capture;
      current.view.showCapture(capture);
      current.view.setStatus('수정한 값을 한 번에 적용합니다.');
    } catch (error) {
      if (!disposed && current === session && ticket === epoch)
        current.view.setStatus((error as Error).message);
    } finally {
      pending = false;
      if (!disposed && current === session) current.view.setBusy(false);
      if (!disposed) changed();
    }
  }
  async function apply(values: readonly string[]) {
    const current = session;
    if (!current?.capture || disposed || pending) return;
    const capture = current.capture;
    pending = true;
    current.view.setBusy(true);
    changed();
    try {
      if (disposed || current !== session) return;
      const result = await options.port.apply(capture, values);
      if (disposed || current !== session) return;
      const latest = options.port.getState();
      if (
        latest.editorId !== capture.state.editorId ||
        latest.documentId !== capture.state.documentId ||
        latest.generation !== capture.state.generation
      ) {
        close();
        return;
      }
      if (
        result.status === 'rejected-unapplied' ||
        (result.status === 'known-no-op' && result.error)
      )
        current.view.setStatus(result.error ?? '변경을 적용하지 못했습니다.');
      else {
        close();
        notify(() =>
          options.onStatus(
            result.status === 'known-no-op'
              ? '차트 값이 같습니다. 변경하지 않았습니다.'
              : result.status === 'committed-with-snapshot'
                ? '기존 차트 데이터를 수정했습니다.'
                : '차트 편집이 반영됐을 수 있습니다. 문서와 표시를 확인하세요. 다시 적용하지 마세요.',
          ),
        );
      }
    } catch (error) {
      if (!disposed && current === session) {
        close();
        notify(() =>
          options.onStatus(
            '차트 처리 결과를 확인할 수 없습니다. 다시 적용하지 말고 문서를 확인하세요. ' +
              String(error),
          ),
        );
      }
    } finally {
      pending = false;
      if (!disposed && current === session) {
        current.view.setBusy(false);
        if (!options.port.current(capture)) current.view.invalidate();
      }
      if (!disposed) changed();
    }
  }
  const unsubscribe = options.port.subscribe(() => {
    const current = session;
    if (!current || disposed) return;
    const latest = options.port.getState();
    if (
      !sameDocument(current.state, latest) ||
      ['loading', 'empty', 'disposed'].includes(latest.status)
    ) {
      close();
      return;
    }
    if (pending) return;
    if (current.capture && !options.port.current(current.capture)) {
      current.capture = null;
      current.view.invalidate();
    }
  });
  return {
    presentation() {
      if (disposed || pending)
        return {
          enabled: false,
          reason: disposed ? '편집기가 종료됐습니다.' : '차트 데이터를 처리하고 있습니다.',
        };
      return options.port.presentation();
    },
    open() {
      if (disposed || pending) return;
      if (session) {
        session.view.focus();
        return;
      }
      const available = options.port.presentation();
      if (!available.enabled) {
        notify(() => options.onStatus(available.reason ?? '차트를 편집할 수 없습니다.'));
        return;
      }
      try {
        const targets = options.port.targets();
        const state = options.port.getState();
        const view = options.createView(targets, {
          onSelect: (target) => {
            void select(target);
          },
          onApply: (values) => {
            void apply(values);
          },
          onDismiss: () => close(true),
        });
        if (disposed || !sameDocument(state, options.port.getState())) {
          view.destroy();
          return;
        }
        session = { view, capture: null, state };
        void select(targets[0]);
      } catch (error) {
        notify(() => options.onStatus(String(error)));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      close();
    },
  };
}
