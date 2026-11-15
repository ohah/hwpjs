import type { ObjectGeometrySelector, ObjectGeometryPatch } from '@hwpjs/core';
import type { ObjectGeometryPort, ObjectGeometryCapture } from './object-geometry-port.ts';
export function createObjectGeometryController(options: {
  port: ObjectGeometryPort;
  selector: ObjectGeometrySelector;
  onCapture(capture: ObjectGeometryCapture): void;
  onStatus(text: string): void;
  onBusy(busy: boolean): void;
  onApplied(): void;
}) {
  let disposed = false,
    busy = false,
    capture: ObjectGeometryCapture | undefined;
  const report = (text: string) => {
    if (!disposed) options.onStatus(text);
  };
  const controller = {
    async read() {
      if (disposed || busy) return;
      busy = true;
      options.onBusy(true);
      try {
        const result = await options.port.read(options.selector);
        if (disposed) return;
        if (!result.available) {
          report('현재 개체의 크기와 위치를 변경할 수 없습니다.');
          return;
        }
        if (!options.port.current(result.capture))
          throw Error('문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
        capture = result.capture;
        options.onCapture(capture);
      } catch {
        report('개체 정보를 확인하지 못했습니다. 속성을 다시 열어주세요.');
      } finally {
        busy = false;
        if (!disposed) options.onBusy(false);
      }
    },
    async apply(patch: ObjectGeometryPatch) {
      if (disposed || busy || !capture) return;
      if (!options.port.current(capture)) {
        report('문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.');
        return;
      }
      busy = true;
      options.onBusy(true);
      try {
        const result = await options.port.apply(capture, patch);
        if (disposed) return;
        if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op')
          options.onApplied();
        else report('개체 속성을 적용하지 못했습니다. 현재 개체 속성을 다시 열어주세요.');
      } catch {
        report('개체 정보를 확인하지 못했습니다. 속성을 다시 열어주세요.');
      } finally {
        busy = false;
        if (!disposed) options.onBusy(false);
      }
    },
    dispose() {
      disposed = true;
      capture = undefined;
    },
  };
  return controller;
}
