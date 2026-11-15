import type {
  ChartDataEditAvailability,
  ChartPropertiesCapture,
  ChartPropertiesObservation,
  ChartPropertiesPort,
  ChartPropertiesTarget,
} from './chart-properties-port.ts';

export interface ChartPropertiesView {
  focus(): void;
  destroy(): void;
  showCapture(
    capture: ChartPropertiesCapture | null,
    availability: ChartDataEditAvailability,
  ): void;
}
export type ChartPropertiesViewFactory = (callbacks: {
  onDismiss(): void;
  onEditData(): void;
}) => ChartPropertiesView;

export function createChartPropertiesController(options: {
  port: ChartPropertiesPort;
  createView: ChartPropertiesViewFactory;
  onStatus(text: string): void;
  onClose(): void;
  onEditData(target: ChartPropertiesTarget): void;
  getDataEditAvailability?(): ChartDataEditAvailability;
}) {
  type Session = {
    observation: ChartPropertiesObservation;
    view: ChartPropertiesView | null;
    capture: ChartPropertiesCapture | null;
  };
  let session: Session | null = null,
    pending = false,
    disposed = false;
  const notify = (callback: () => void) => {
    try {
      callback();
    } catch {
      /* Host UI callbacks are not resource authority. */
    }
  };
  function availability(capture: ChartPropertiesCapture): ChartDataEditAvailability {
    const unavailable = { enabled: false, reason: '현재 차트 데이터를 편집할 수 없습니다.' };
    if (!options.port.isCaptureCurrent(capture)) return unavailable;
    try {
      const value = options.getDataEditAvailability?.();
      const enabled = value?.enabled === true;
      const reason = typeof value?.reason === 'string' ? value.reason : unavailable.reason;
      return options.port.isCaptureCurrent(capture)
        ? { enabled, reason: enabled ? undefined : reason }
        : unavailable;
    } catch {
      return unavailable;
    }
  }
  function close(restore = false) {
    const old = session;
    session = null;
    old?.view?.destroy();
    if (restore && old && !session && !disposed && options.port.current(old.observation))
      notify(options.onClose);
  }
  function handoff(current: Session) {
    if (disposed || session !== current || pending || !current.capture) return;
    const capture = current.capture;
    const allowed = availability(capture);
    if (disposed || session !== current || !options.port.isCaptureCurrent(capture)) return;
    if (!allowed.enabled) {
      current.view?.showCapture(capture, allowed);
      return;
    }
    close();
    // Destroying a modal may reenter the host or replace the document.
    const afterClose = availability(capture);
    if (
      !disposed &&
      !session &&
      !pending &&
      afterClose.enabled &&
      options.port.isCaptureCurrent(capture)
    )
      notify(() => options.onEditData(capture.target));
  }
  const unsubscribe = options.port.subscribe(() => {
    if (session && !options.port.current(session.observation)) close();
  });
  return {
    open(target: ChartPropertiesTarget): void {
      if (disposed) return;
      let observation: ChartPropertiesObservation;
      try {
        observation = options.port.observe(target);
      } catch (error) {
        notify(() => options.onStatus((error as Error).message));
        return;
      }
      if (
        session &&
        options.port.current(session.observation) &&
        session.observation.target.section === observation.target.section &&
        session.observation.target.wrapper === observation.target.wrapper
      ) {
        session.view?.focus();
        return;
      }
      if (pending) {
        notify(() => options.onStatus('차트 속성을 읽고 있습니다.'));
        return;
      }
      close();
      const current: Session = { observation, view: null, capture: null };
      session = current;
      pending = true;
      try {
        const view = options.createView({
          onDismiss: () => {
            if (session === current) close(true);
          },
          onEditData: () => handoff(current),
        });
        if (disposed || session !== current || !options.port.current(observation)) {
          view.destroy();
          pending = false;
          if (session === current) close();
          return;
        }
        current.view = view;
        view.showCapture(null, { enabled: false });
      } catch (error) {
        pending = false;
        if (session === current) close();
        notify(() => options.onStatus((error as Error).message));
        return;
      }
      void (async () => {
        try {
          const capture = await options.port.capture(observation);
          if (disposed || session !== current || !options.port.current(capture)) return;
          const allowed = availability(capture);
          if (disposed || session !== current || !options.port.isCaptureCurrent(capture)) return;
          current.capture = capture;
          current.view!.showCapture(capture, allowed);
        } catch (error) {
          if (!disposed && session === current) {
            close();
            notify(() => options.onStatus((error as Error).message));
          }
        } finally {
          pending = false;
        }
      })();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      close();
    },
  };
}
