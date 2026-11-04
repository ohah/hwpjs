import {
  pictureMillimeters,
  pictureSize,
  type PictureSizeDraft,
} from './object-properties-input.ts';
import {
  sameObjectDocument,
  type ObjectPropertiesCapture,
  type ObjectPropertiesPort,
} from './object-properties-port.ts';

export interface ObjectPropertiesView {
  focus(): void;
  setBusy(value: boolean): void;
  setAvailability(reason: string | null): void;
  setStatus(text: string): void;
  destroy(): void;
}
export type ObjectPropertiesViewFactory = (
  capture: ObjectPropertiesCapture,
  draft: PictureSizeDraft,
  callbacks: { onApply(draft: PictureSizeDraft): void; onDismiss(): void },
) => ObjectPropertiesView;
export function createObjectPropertiesController(options: {
  port: ObjectPropertiesPort;
  createView: ObjectPropertiesViewFactory;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange?(): void;
  onError?(error: unknown): void;
}) {
  let session: { capture: ObjectPropertiesCapture; view?: ObjectPropertiesView } | undefined;
  let disposed = false,
    pending = false,
    opening = false,
    epoch = 0;
  const notify = (callback: () => void) => {
    try {
      callback();
    } catch (error) {
      // UI callback failure cannot turn an already committed edit into an unapplied result.
      try {
        options.onError?.(error);
      } catch {
        /* terminal UI error boundary */
      }
    }
  };
  const status = (text: string) => notify(() => options.onStatus(text));
  function close(restore = false) {
    epoch++;
    const closing = session;
    session = undefined;
    closing?.view?.destroy();
    if (!restore || !closing?.view || disposed || session) return;
    const now = options.port.capture().state;
    if (
      disposed ||
      session ||
      now.status !== 'ready' ||
      !sameObjectDocument(closing.capture.state, now)
    )
      return;
    notify(options.onClose);
  }
  const reason = (capture: ObjectPropertiesCapture): string | null => {
    const latest = options.port.capture();
    if (latest.state !== capture.state) return '선택이 바뀌었습니다. 개체 속성을 다시 열어주세요.';
    const a = capture.target,
      b = latest.target;
    return (
      latest.reason ??
      (!a ||
      !b ||
      a.section !== b.section ||
      a.pictureNode !== b.pictureNode ||
      a.width !== b.width ||
      a.height !== b.height ||
      a.resizeRecordNode !== b.resizeRecordNode
        ? '그림 선택이 바뀌었습니다. 개체 속성을 다시 열어주세요.'
        : null)
    );
  };
  async function apply(draft: PictureSizeDraft) {
    const current = session;
    if (disposed || pending || !current?.view) return;
    let invalid: string | null;
    try {
      pictureSize(draft, current.capture.target ?? undefined);
      invalid = reason(current.capture);
    } catch {
      invalid = '너비와 높이에 유효한 양의 mm 값을 입력하세요.';
    }
    if (disposed || session !== current) return;
    if (invalid) {
      current.view.setStatus(invalid);
      return;
    }
    pending = true;
    let started = false;
    try {
      current.view.setBusy(true);
      notify(() => options.onPresentationChange?.());
      if (disposed || session !== current) return;
      // The port repeats current selection checks AFTER the presentation callback.
      started = true;
      const result = await options.port.apply(current.capture, draft);
      if (disposed || session !== current) return;
      const latest = options.port.capture().state;
      if (!sameObjectDocument(current.capture.state, latest)) {
        close();
        return;
      }
      if (result.status === 'committed-refresh-required') {
        close();
        status(
          '크기는 반영됐지만 화면 확인이 필요합니다. 다시 적용하지 말고 문서를 확인하세요.' +
            (result.error ? ' (' + result.error + ')' : ''),
        );
      } else if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
        const text =
          result.status === 'known-no-op'
            ? '그림 크기가 같습니다. 변경하지 않았습니다.'
            : '그림 크기를 바꿨습니다.';
        close(latest.status === 'ready');
        if (!disposed && !session) status(text);
      } else if (result.status.startsWith('committed')) {
        close();
        status('편집이 반영됐을 수 있습니다. 문서를 확인하고 자동 재시도하지 마세요.');
      } else {
        current.view.setStatus(result.error ?? '그림 크기를 바꾸지 못했습니다.');
      }
    } catch (error) {
      if (!disposed && session === current) {
        if (started) {
          // A rejected Promise alone cannot establish whether Native applied anything.
          close();
          status('처리 결과를 확인할 수 없습니다. 문서를 확인하세요. ' + String(error));
        } else current.view.setStatus(String(error));
      }
    } finally {
      pending = false;
      if (!disposed) notify(() => options.onPresentationChange?.());
      if (!disposed && session === current) {
        current.view.setBusy(false);
        current.view.setAvailability(reason(current.capture));
      }
    }
  }
  const unsubscribe = options.port.subscribe(() => {
    const current = session;
    if (!current || disposed) return;
    const latest = options.port.capture().state;
    if (
      !sameObjectDocument(current.capture.state, latest) ||
      latest.status === 'disposed' ||
      latest.status === 'loading' ||
      latest.status === 'empty'
    )
      close();
    else if (!pending) current.view?.setAvailability(reason(current.capture));
  });
  return {
    presentation() {
      if (disposed || pending)
        return {
          enabled: false,
          reason: pending ? '그림 크기를 반영하고 있습니다.' : '편집기가 종료됐습니다.',
        };
      return options.port.availability();
    },
    open() {
      if (disposed || pending || opening) return;
      if (session?.view) {
        session.view.focus();
        return;
      }
      opening = true;
      try {
        const ticket = epoch;
        const capture = options.port.capture();
        if (disposed || epoch !== ticket) return;
        if (capture.reason || !capture.target) {
          status(capture.reason ?? '그림을 먼저 선택하세요.');
          return;
        }
        const current = { capture, view: undefined as ObjectPropertiesView | undefined };
        session = current;
        const created = options.createView(
          capture,
          {
            width: pictureMillimeters(capture.target.width),
            height: pictureMillimeters(capture.target.height),
          },
          {
            onApply: (draft) => {
              void apply(draft);
            },
            onDismiss: () => close(true),
          },
        );
        if (disposed || session !== current) created.destroy();
        else {
          current.view = created;
          created.setAvailability(reason(capture));
        }
      } finally {
        opening = false;
      }
    },
    close: () => close(true),
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      close();
    },
  };
}
