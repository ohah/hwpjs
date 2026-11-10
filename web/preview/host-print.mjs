import { createHostEpochReaders, HOST_EPOCH_KEYS } from './host-epoch-readers.mjs';
import { createDocumentOutputRenderer } from './renderer.mjs';

import { planPrintRaster } from './print-raster-plan.mjs';

const MAX_ENCODED_BYTES = 48 * 1024 * 1024;
const DEADLINE_MS = 30000;
const activeEditors = new WeakSet();

function assertOutputContent(content) {
  if (
    !content ||
    !['hwpx', 'hwp5'].includes(content.format) ||
    content.window ||
    content.viewKind ||
    content.limited ||
    !Array.isArray(content.paragraphs) ||
    content.paragraphs.length !== content.totalParagraphs ||
    content.paragraphs.some((paragraph) => paragraph.clipped)
  )
    throw Error('IncompletePrintSnapshot');
  // Keep document output inside the verified body/table/picture subset.
  for (const key of [
    'chartTargets',
    'drawings',
    'rectangles',
    'lines',
    'ellipses',
    'curves',
    'oles',
    'checkBoxes',
    'hwp5Forms',
    'hwp5Memos',
    'equationErrors',
  ]) {
    if (content[key]?.length) throw Error(`PrintObjectCoverageUnverified:${key}`);
  }
  if (content.paragraphs.some((paragraph) => paragraph.equations?.length))
    throw Error('PrintObjectCoverageUnverified:equations');
}

function assertPaintCoverage(content, pictures) {
  for (const { section, pictureNode } of content.pictures ?? []) {
    if (!pictures.has(`${section}:${pictureNode}`))
      throw Error(`PrintPicturePaintIncomplete:${section}:${pictureNode}`);
  }
}

function assertTableCoverage(borders) {
  if (borders.proxy || borders.unavailableCount || borders.paintFailureCount)
    throw Error(
      `PrintTablePaintIncomplete:${borders.proxy}:${borders.unavailableCount}:${borders.paintFailureCount}`,
    );
}

/** Render one ordered raster job. All page blobs remain private until the last fence check. */
export async function capturePrintPages(
  editor,
  document,
  { signal, scale = 1, encoding = 'png' } = {},
  environment = {},
  referenceCanvas = null,
) {
  if (!['png', 'jpeg'].includes(encoding)) throw Error('InvalidPrintEncoding');
  const type = `image/${encoding}`;
  const realm = document.defaultView;
  if (!realm || !document.fonts || typeof realm.OffscreenCanvas !== 'function')
    throw Error('PrintCanvasHostUnavailable');
  if (activeEditors.has(editor)) throw Error('PrintJobAlreadyActive');
  activeEditors.add(editor);
  const stop = new AbortController();
  const cancel = () => stop.abort(signal.reason);
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = realm.setTimeout(() => stop.abort(Error('PrintDeadlineExceeded')), DEADLINE_MS);
  let renderer, pageCanvas, unsubscribe;
  let current = () => true;
  const check = () => {
    stop.signal.throwIfAborted();
    if (!current()) throw Error('StalePrintDocument');
  };
  const wait = async (task) => {
    const abort = () => rejectStop(stop.signal.reason);
    let rejectStop;
    const interruption = new Promise((_, reject) => {
      rejectStop = reject;
    });
    stop.signal.addEventListener('abort', abort, { once: true });
    if (stop.signal.aborted) abort();
    try {
      const result = await Promise.race([task, interruption]);
      check();
      return result;
    } finally {
      stop.signal.removeEventListener('abort', abort);
    }
  };
  try {
    check();
    const snapshot = await wait(editor.captureDocumentOutput(stop.signal));
    const hostEpochs = createHostEpochReaders(environment);
    const epochs = HOST_EPOCH_KEYS.map((key) => hostEpochs[key]());
    if (
      epochs.some(
        (epoch) =>
          epoch !== undefined &&
          (!epoch ||
            typeof epoch !== 'object' ||
            !Object.isFrozen(epoch) ||
            Reflect.ownKeys(epoch).length !== 0),
      )
    )
      throw Error('InvalidPrintHostEpoch');
    const decodeImage = environment.decodeImage;
    const hostDirection = () =>
      referenceCanvas ? realm.getComputedStyle(referenceCanvas).direction : document.dir;
    const hostLanguage = () =>
      referenceCanvas?.closest('[lang]')?.lang || document.documentElement.lang;
    const direction = hostDirection();
    const language = hostLanguage();
    current = () =>
      snapshot.isCurrent() &&
      environment.decodeImage === decodeImage &&
      hostDirection() === direction &&
      hostLanguage() === language &&
      HOST_EPOCH_KEYS.every((key, i) => hostEpochs[key]() === epochs[i]);
    unsubscribe = editor.registerStateListener(() => {
      try {
        check();
      } catch (error) {
        stop.abort(error);
      }
    });
    const { content, token } = snapshot.state;
    assertOutputContent(content);
    await wait(document.fonts.ready);
    const measurement = document.createElement('canvas');
    measurement.lang = language;
    measurement.dir = direction === 'rtl' ? 'rtl' : 'ltr';
    renderer = createDocumentOutputRenderer(measurement);
    if (decodeImage) renderer.pictureDecoder(decodeImage.bind(environment));
    const read = async (message) => {
      check();
      const reply = await editor.readResource(message, token);
      check();
      if (reply.error) throw Error(reply.error);
      return reply.bytes;
    };
    renderer.pictureReader((section, pictureNode) =>
      read({ kind: 'picture-bytes', section, pictureNode }),
    );
    renderer.tableBackgroundReader((section, listNode) =>
      read({ kind: 'table-background-bytes', section, listNode }),
    );
    const output = renderer.documentOutputPort;
    const sections = new Set(content.paragraphs.map((paragraph) => paragraph.section));
    const singleSection = sections.size === 1 ? sections.values().next().value : undefined;
    planPrintRaster(renderer.show(content), scale, singleSection);
    await wait(output.settleResources());
    await wait(document.fonts.ready);
    const plan = planPrintRaster(output.reflow(), scale, singleSection);
    const generations = output.generations();
    await wait(output.settleResources());
    await wait(document.fonts.ready);
    const snapshotCurrent = current;
    current = () =>
      snapshotCurrent() &&
      document.fonts.status === 'loaded' &&
      output.generations().every((value, i) => value === generations[i]);
    check();

    const batch = output.preparePages(plan.pages);
    pageCanvas = new realm.OffscreenCanvas(1, 1);
    const pages = [];
    const painted = new Set();
    let bytes = 0;
    for (const page of plan.pages) {
      check();
      const { width, height, pixelWidth, pixelHeight } = page;
      // Setting the backing dimensions clears state and pixels for every sheet.
      pageCanvas.width = pixelWidth;
      pageCanvas.height = pixelHeight;
      const target = pageCanvas.getContext('2d', { alpha: false });
      if (!target || target.isContextLost?.()) throw Error('PrintCanvasContextUnavailable');
      target.direction = measurement.dir;
      const evidence = batch.paintPage(page, target);
      assertTableCoverage(evidence.tableBorders);
      for (const id of evidence.pictures) painted.add(id);
      if (target.isContextLost?.()) throw Error('PrintCanvasContextUnavailable');
      const blob = await wait(pageCanvas.convertToBlob({ type, quality: 0.96 }));
      pageCanvas.width = pageCanvas.height = 0;
      bytes += blob.size;
      if (blob.type !== type || !blob.size || bytes > MAX_ENCODED_BYTES)
        throw Error('PrintEncodedBudgetExceeded');
      pages.push(
        Object.freeze({
          ordinal: page.ordinal,
          section: page.section,
          widthCssPx: width,
          heightCssPx: height,
          pixelWidth,
          pixelHeight,
          [encoding]: blob,
        }),
      );
    }
    assertPaintCoverage(content, painted);
    await wait(snapshot.confirmCurrent());
    return Object.freeze({
      kind: 'paginated-canvas-print-pages',
      token,
      scale,
      encoding,
      pages: Object.freeze(pages),
      statistics: Object.freeze({
        totalPixels: plan.totalPixels,
        maxPagePixels: plan.maxPagePixels,
        sceneVisits: batch.visits,
      }),
    });
  } catch (error) {
    check();
    throw error;
  } finally {
    activeEditors.delete(editor);
    unsubscribe?.();
    renderer?.close();
    if (pageCanvas) pageCanvas.width = pageCanvas.height = 0;
    realm.clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}
