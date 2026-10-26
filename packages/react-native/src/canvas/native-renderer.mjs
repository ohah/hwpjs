import { nativeResourceDocument } from './resource-document.mjs';
import {
  withTextBoundaries,
  currentTextBoundaryIdentity,
} from '../../../../web/preview/text-boundary-platform.mjs';
import { createRenderer } from '../../../../web/preview/renderer.mjs';
import { createNativeCommandContext } from './command-context.mjs';
import { caretGeometry, hitText } from '../../../../web/preview/text-geometry.mjs';

/** Concrete UIView geometry/resource ports. Objects here are rendering ports,
 * not document/window/DOM shims. Canonical renderer consumes their existing API. */
export function createNativeRenderer(surface) {
  const textBoundaries = surface.textBoundaries;
  let closed = false,
    revision = 0,
    presentedRevision = 0,
    resourceEpoch = 0,
    layout = null,
    scheduled = new Map(),
    serial = 0;
  const timeouts = new Set(),
    intervals = new Set();
  const scopedTimeout = (callback, delay, ...args) => {
    const id = setTimeout(() => {
      timeouts.delete(id);
      if (!closed) withTextBoundaries(textBoundaries, () => callback(...args));
    }, delay);
    timeouts.add(id);
    return id;
  };
  const cancelTimeout = (id) => {
    timeouts.delete(id);
    clearTimeout(id);
  };
  const scopedInterval = (callback, delay, ...args) => {
    const id = setInterval(() => {
      if (!closed) withTextBoundaries(textBoundaries, () => callback(...args));
    }, delay);
    intervals.add(id);
    return id;
  };
  const cancelInterval = (id) => {
    intervals.delete(id);
    clearInterval(id);
  };
  const waiters = [],
    fontObservations = new Map();
  const recorder = createNativeCommandContext((text, font) => {
    const metrics = surface.measureText(text, font);
    fontObservations.set(font, {
      requested: font,
      resolved: metrics.resolvedFont ?? null,
      fallback: metrics.fontFallback ?? null,
    });
    return metrics;
  });
  const geometry = surface.bounds();
  const viewport = {
    clientWidth: geometry.width,
    clientHeight: geometry.height,
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener() {},
    removeEventListener() {},
  };
  const canvas = {
    style: {},
    dataset: {},
    width: 0,
    height: 0,
    getContext: () => recorder.ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, ...surface.bounds() }),
  };
  recorder.ctx.canvas = canvas;
  const spacer = { style: {} };
  const flush = (callback) => {
    if (closed) return;
    recorder.begin();
    withTextBoundaries(textBoundaries, callback);
    if (layout?.state !== 'paginated') return;
    if (canvas.dataset.paintPending === 'true') return;
    if (
      layout.objectCoverage === 'incomplete' ||
      layout.unrenderedObjects?.length ||
      layout.pictureCoverage?.failed ||
      layout.tableBackgroundCoverage?.failed
    ) {
      const error = Error('IncompleteNativePaintCoverage');
      for (const w of waiters.splice(0)) w.reject(error);
      surface.onError?.(error);
      return;
    }
    const hitTargets = [];
    const seen = new Set();
    for (const row of layout.rows) {
      const key = row.section + ':' + row.paragraph;
      if (!row.editable || seen.has(key)) continue;
      seen.add(key);
      const caret = withTextBoundaries(textBoundaries, () =>
        caretGeometry(layout, {
          section: row.section,
          paragraph: row.paragraph,
          unit: row.startUnit,
        }),
      );
      if (!caret) continue;
      const x = caret.x - viewport.scrollLeft,
        y = caret.y - viewport.scrollTop;
      if (x < 0 || y < 0 || x >= viewport.clientWidth || y + caret.height > viewport.clientHeight)
        continue;
      hitTargets.push({
        id: 'canvas-body-' + row.section + '-' + row.paragraph,
        rect: [x, y, 1, caret.height],
      });
    }
    const current = revision;
    Promise.resolve(
      surface.present({
        hitTargets,
        protocol: 'hwpjs.native-canvas/1',
        state: 'paginated',
        revision: current,
        scale: 1,
        commands: recorder.finish(),
        observation: {
          picturePending: canvas.dataset.picturePending === 'true',
          paintPending: canvas.dataset.paintPending === 'true',
          publicToken: surface.currentContent()?.canvasObservationToken,
          nativeRevision: surface.currentContent()?.nativeRevision,
        },
      }),
    ).then(
      () => {
        if (!closed && current === revision) {
          presentedRevision = current;
          for (const w of waiters.splice(0)) w.resolve({ revision, layout });
        }
      },
      (error) => {
        if (current === revision) {
          for (const w of waiters.splice(0)) w.reject(error);
          surface.onError?.(error);
        }
      },
    );
  };
  const environment = {
    textBoundaryIdentity: () => withTextBoundaries(textBoundaries, currentTextBoundaryIdentity),
    requestFrame(callback) {
      const id = ++serial;
      scheduled.set(id, callback);
      scopedTimeout(() => {
        if (scheduled.has(id)) drain();
      }, 0);
      return id;
    },
    cancelFrame(id) {
      scheduled.delete(id);
    },
    setTimeout: scopedTimeout,
    clearTimeout: cancelTimeout,
    setInterval: scopedInterval,
    clearInterval: cancelInterval,
    devicePixelRatio: () => 1,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const rawRenderer = withTextBoundaries(textBoundaries, () =>
    createRenderer(
      canvas,
      viewport,
      spacer,
      (value) => {
        layout = value;
        revision++;
        presentedRevision = 0;
      },
      environment,
    ),
  );
  const renderer = new Proxy(rawRenderer, {
    get(target, key) {
      const value = target[key];
      return typeof value === 'function'
        ? (...args) => withTextBoundaries(textBoundaries, () => value.apply(target, args))
        : value;
    },
  });

  renderer.pictureDecoder((bytes, meta) =>
    surface.decodeImage(bytes, { ...meta, revision: resourceEpoch }),
  );
  function drain() {
    // 새 callback은 다음 frame으로 넘기므로 이번 drain의 snapshot을 유지합니다.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const [id, callback] of [...scheduled]) {
      scheduled.delete(id);
      flush(callback);
    }
  }
  const unsubscribe = surface.onBounds((bounds) => {
    if (closed) return;
    viewport.clientWidth = bounds.width;
    viewport.clientHeight = bounds.height;
    if (!surface.currentContent()) return;
    renderer.show(surface.currentContent(), { preserveScroll: true });
    drain();
  });
  return {
    show(content) {
      if (closed) throw Error('Disposed');
      const resourceDocument = nativeResourceDocument(content);
      const observation = content.canvasObservationToken,
        nativeRevision = content.nativeRevision;
      renderer.pictureReader((section, node) =>
        surface.pictureBytes(observation, nativeRevision, section, node),
      );
      resourceEpoch++;
      surface.beginResources(resourceEpoch, resourceDocument);
      layout = renderer.show(content, { resourceEpoch, resourceDocument });
      if (layout.state !== 'paginated' || layout.limited)
        throw Error(layout.error ?? 'IncompleteLayout');
      const painted = new Promise((resolve, reject) => waiters.push({ resolve, reject }));
      drain();
      return painted;
    },
    drain,
    fontMetadata: () => [...fontObservations.values()],
    hit(point) {
      if (closed) throw Error('Disposed');
      if (
        point.revision !== revision ||
        presentedRevision !== revision ||
        !renderer.isPaintedFrameCurrent()
      )
        throw Error('StaleFrame');
      const b = surface.bounds();
      if (
        ![point.x, point.y].every(Number.isFinite) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x >= b.width ||
        point.y >= b.height
      )
        throw Error('OutsideSurface');
      return withTextBoundaries(textBoundaries, () =>
        hitText(layout, point.x + viewport.scrollLeft, point.y + viewport.scrollTop),
      );
    },
    reveal(section, paragraph) {
      const row = layout.rows.find(
        (r) => r.section === section && r.paragraph === paragraph && r.editable,
      );
      if (!row) throw Error('NoEditableLayoutRow');
      const caret = withTextBoundaries(textBoundaries, () =>
        caretGeometry(layout, { section, paragraph, unit: row.startUnit }),
      );
      if (!caret) throw Error('NoCaretGeometry');
      viewport.scrollTop = Math.max(0, caret.y - viewport.clientHeight / 2);
      viewport.scrollLeft = Math.max(0, caret.x - viewport.clientWidth / 2);
      const painted = new Promise((resolve, reject) => waiters.push({ resolve, reject }));
      renderer.show(surface.currentContent(), { preserveScroll: true });
      drain();
      return painted;
    },
    scroll(x, y) {
      if (![x, y].every(Number.isFinite) || x < 0 || y < 0) throw Error('InvalidScroll');
      viewport.scrollLeft = x;
      viewport.scrollTop = y;
      renderer.show(surface.currentContent(), { preserveScroll: true });
      drain();
    },
    close() {
      if (closed) return;
      closed = true;
      for (const w of waiters.splice(0)) w.reject(Error('Disposed'));
      scheduled.clear();
      for (const id of timeouts) clearTimeout(id);
      for (const id of intervals) clearInterval(id);
      timeouts.clear();
      intervals.clear();
      const failures = [];
      try {
        unsubscribe();
      } catch (error) {
        failures.push(error);
      }
      try {
        renderer.close();
      } catch (error) {
        failures.push(error);
      }
      try {
        surface.dispose();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length) throw new AggregateError(failures, 'NativeCanvasCleanupFailed');
    },
  };
}
