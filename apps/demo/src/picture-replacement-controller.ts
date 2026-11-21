import {
  createPictureReplacementInputLane,
  type PictureReplacementInputTicket,
} from './picture-replacement-input-lane.mjs';
import type {
  createPictureReplacementPort,
  PictureReplacementCapture,
} from './picture-replacement-port.ts';

export function createPictureReplacementController(options: {
  root: HTMLElement;
  port: ReturnType<typeof createPictureReplacementPort>;
  setAvailability(enabled: boolean, reason: string): void;
  setBusy(busy: boolean, submitted?: boolean): void;
  onStatus(text: string): void;
  onClose(): void;
  onError?(error: unknown): void;
}) {
  const file = options.root.ownerDocument.createElement('input');
  file.type = 'file';
  file.accept = '.png,.jpg,.jpeg,image/png,image/jpeg';
  file.hidden = true;
  file.dataset.role = 'picture-replacement-file';
  let disposed = false;
  let capture: PictureReplacementCapture | null = null;
  let ticket: PictureReplacementInputTicket | null = null;
  let sent = false;
  let prepared = false;
  const notify = (action: () => void) => {
    try {
      action();
    } catch (error) {
      try {
        options.onError?.(error);
      } catch {
        /* presentation error boundary */
      }
    }
  };
  const availability = (enabled: boolean, reason: string) =>
    notify(() => options.setAvailability(enabled, reason));
  const lane = createPictureReplacementInputLane({
    capture: () => capture,
    isCurrent: options.port.current,
    submit(owner, bytes) {
      notify(() => options.setBusy(true, true));
      sent = true;
      return options.port.submit(owner, bytes);
    },
  });
  function cancel() {
    if (ticket) lane.cancel(ticket);
    ticket = null;
    file.value = '';
  }
  async function change() {
    const selected = file.files;
    const owned = ticket;
    ticket = null;
    if (!owned || disposed) return;
    if (!selected || selected.length !== 1) {
      lane.cancel(owned);
      return;
    }
    notify(() => options.setBusy(true));
    sent = false;
    try {
      const result = await lane.read(owned, selected[0]);
      if (disposed) return;
      if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
        notify(options.onClose);
        notify(() =>
          options.onStatus(
            result.status === 'known-no-op'
              ? '동일한 이미지여서 변경하지 않았습니다.'
              : '선택한 그림의 이미지를 바꿨습니다.',
          ),
        );
      } else if (result.status.startsWith('committed')) {
        notify(options.onClose);
        notify(() =>
          options.onStatus(
            '교체가 반영됐을 수 있습니다. 문서 화면을 확인하고 자동 재시도하지 마세요.',
          ),
        );
      } else {
        availability(
          false,
          result.error ?? '그림을 교체하지 못했습니다. 속성 창을 다시 열어주세요.',
        );
      }
    } catch (error) {
      if (disposed) return;
      if (sent) {
        notify(options.onClose);
        notify(() =>
          options.onStatus(
            '교체 결과를 확인할 수 없습니다. 자동 재시도하지 말고 문서를 확인하세요.',
          ),
        );
      } else availability(false, '이미지 파일을 읽지 못했습니다. ' + String(error));
    } finally {
      file.value = '';
      if (!disposed) notify(() => options.setBusy(false));
    }
  }
  file.addEventListener('change', change);
  file.addEventListener('cancel', cancel);
  options.root.append(file);
  return {
    input: file,
    async prepare() {
      if (prepared || disposed) return;
      prepared = true;
      availability(false, '현재 그림의 교체 지원을 확인하고 있습니다.');
      try {
        const value = await options.port.capture();
        if (disposed) return;
        if (!options.port.current(value)) throw Error('그림 선택이 바뀌었습니다.');
        capture = value;
        availability(true, '크기·배치·자르기를 유지하며 이미지 파일만 교체합니다.');
      } catch (error) {
        if (!disposed) availability(false, String(error));
      }
    },
    choose() {
      if (disposed || !capture || !options.port.current(capture)) return;
      const next = lane.capture();
      if (!next) return;
      ticket = next;
      file.value = '';
      try {
        file.click();
      } catch (error) {
        cancel();
        availability(false, String(error));
      }
    },
    check() {
      if (!capture || disposed || options.port.current(capture)) return;
      capture = null;
      lane.invalidate();
      availability(false, '그림 선택이나 문서가 바뀌었습니다. 속성 창을 다시 열어주세요.');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      lane.dispose();
      file.removeEventListener('change', change);
      file.removeEventListener('cancel', cancel);
      file.remove();
    },
  };
}
