import { createTextBoundaries } from './text-boundaries.mjs';
// Callback ids remain JS-owned; Native reply packets contain copied DTOs only.
export function createHostSurface(host, { onPoint, onError = () => {} } = {}) {
  const protocol = host.resourceProtocol;
  if (protocol !== undefined && protocol !== 'hwpjs.native-image-resources/2')
    throw Error('NativeImageResourceProtocolMismatch');
  const imageResourcesV2 = protocol === 'hwpjs.native-image-resources/2';
  let next = 0,
    closed = false;
  const textBoundaries = createTextBoundaries(host);
  const pending = new Map(),
    listeners = new Set();
  host.setReplyHandler((message) => {
    if (closed) return;
    if (message.event === 'bounds') {
      for (const listener of listeners) listener(message);
      return;
    }
    if (message.event === 'point') {
      onPoint?.(message.point);
      return;
    }
    if (message.event === 'error') {
      onError(Error(message.error));
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(Error(message.error));
    else request.resolve(message);
  });
  const request = (invoke) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(Error('Disposed'));
      if (next >= 0xffffffff) return reject(Error('CanvasRequestIdExhausted'));
      const id = ++next;
      pending.set(id, { resolve, reject });
      try {
        invoke(id);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  return {
    textBoundaries,
    bounds: () => host.bounds(),
    measureText: (text, font) => host.measureText(text, font),
    onError,
    onBounds(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    beginResources: (epoch, document) =>
      imageResourcesV2 ? host.beginResources(epoch, document) : host.beginResources(epoch),
    present: (frame) => request((id) => host.present(id, JSON.stringify(frame))),
    async decodeImage(bytes, { revision }) {
      const key = 'bitmap-' + (next + 1);
      const reply = await request((id) => host.decodeImage(id, key, bytes, revision));
      const { width, height, version } = reply.size ?? {};
      if (imageResourcesV2 && (!Number.isInteger(version) || version < 1 || version > 0xffffffff)) {
        host.releaseImage(key);
        throw Error('InvalidNativeBitmapVersion');
      }
      const release = () =>
        imageResourcesV2 ? host.releaseImage(key, version) : host.releaseImage(key);
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width <= 0 ||
        height <= 0
      ) {
        release();
        throw Error('InvalidNativeBitmapSize');
      }
      let released = false;
      return {
        key,
        width,
        height,
        close() {
          if (released) return;
          released = true;
          if (!closed) release();
        },
      };
    },
    dispose() {
      if (closed) return;
      closed = true;
      textBoundaries.dispose();
      for (const p of pending.values()) p.reject(Error('Disposed'));
      pending.clear();
      listeners.clear();
      host.dispose();
    },
  };
}
