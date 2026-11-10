const PREPARE_TIMEOUT_MS = 15000;
const MAX_PRINT_PAGES = 200;
const MAX_PRINT_PIXELS = 80_000_000;
const MAX_PRINT_BYTES = 48 * 1024 * 1024;

function paperSize(cssPixels) {
  const points = (cssPixels * 72) / 96;
  if (typeof cssPixels !== 'number' || !Number.isFinite(points) || points < 1 || points > 14400)
    throw Error('InvalidBrowserPrintPaper');
  return `${points.toFixed(6)}pt`;
}

/** The named page sizes use the same CSS-pixel to point conversion as R4 MediaBoxes. */
export function planBrowserPrint(job) {
  if (
    job?.kind !== 'paginated-canvas-print-pages' ||
    job.encoding !== 'jpeg' ||
    !Array.isArray(job.pages) ||
    !job.pages.length ||
    job.pages.length > MAX_PRINT_PAGES
  )
    throw Error('InvalidBrowserPrintJob');
  let pixels = 0,
    bytes = 0;
  const sizes = new Map();
  const pages = job.pages.map((page, ordinal) => {
    if (
      page.ordinal !== ordinal ||
      page.jpeg?.type !== 'image/jpeg' ||
      !page.jpeg.size ||
      ![page.pixelWidth, page.pixelHeight].every((n) => Number.isInteger(n) && n >= 1 && n <= 8192)
    )
      throw Error('InvalidBrowserPrintPage');
    const area = page.pixelWidth * page.pixelHeight;
    pixels += area;
    bytes += page.jpeg.size;
    if (area > 8_000_000 || pixels > MAX_PRINT_PIXELS || bytes > MAX_PRINT_BYTES)
      throw Error('BrowserPrintBudgetExceeded');
    const width = paperSize(page.widthCssPx);
    const height = paperSize(page.heightCssPx);
    const key = `${width} ${height}`;
    if (!sizes.has(key)) sizes.set(key, `hwpSheet${sizes.size}`);
    return { name: sizes.get(key), width, height, page };
  });
  const rules = [...sizes].map(([size, name]) => `@page ${name} { size: ${size}; margin: 0; }`);
  return { pages, rules };
}

function abortable(task, signal) {
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  return Promise.race([task, interrupted]).finally(() =>
    signal.removeEventListener('abort', abort),
  );
}

/**
 * Open synchronously from the dialog click. Await ready, then invoke only the
 * owned window's native print method. Closing the handle is idempotent.
 */
export function openBrowserPrintTarget(
  document,
  job,
  { signal, title = '문서 인쇄', isCurrent = () => true, onClose = () => {} } = {},
) {
  const realm = document.defaultView;
  signal?.throwIfAborted();
  if (!isCurrent(job?.token)) throw Error('StalePrintDocument');
  const plan = planBrowserPrint(job);
  if (!realm?.CSS?.supports('page', 'hwpSheet0')) throw Error('BrowserPrintNamedPagesUnavailable');
  const popup = realm.open('', '_blank', 'popup,width=820,height=720');
  if (!popup) throw Error('BrowserPrintPopupBlocked');
  const abort = new AbortController();
  const urls = [];
  let ended = false,
    prepared = false,
    invoked = false;
  let timer, watch;
  const ownerAbort = () => close('owner-abort');
  const ownerPageHide = () => close('owner-pagehide');
  const afterprint = () => {
    if (invoked) close('afterprint');
  };
  const close = (reason = 'cancelled') => {
    if (ended) return;
    ended = true;
    abort.abort(Error('BrowserPrintTargetClosed'));
    realm.clearTimeout(timer);
    realm.clearInterval(watch);
    signal?.removeEventListener('abort', ownerAbort);
    realm.removeEventListener('pagehide', ownerPageHide);
    try {
      popup.removeEventListener('afterprint', afterprint);
    } catch {
      /* A navigated target still belongs to this handle. */
    } finally {
      for (const url of urls) realm.URL.revokeObjectURL(url);
      if (!popup.closed) popup.close();
      onClose(reason);
    }
  };
  const check = () => {
    abort.signal.throwIfAborted();
    signal?.throwIfAborted();
    if (popup.closed) throw Error('BrowserPrintTargetClosed');
    if (!isCurrent(job.token)) throw Error('StalePrintDocument');
  };

  signal?.addEventListener('abort', ownerAbort, { once: true });
  realm.addEventListener('pagehide', ownerPageHide, { once: true });
  watch = realm.setInterval(() => {
    if (popup.closed) close('target-closed');
  }, 150);
  const ready = (async () => {
    try {
      check();
      popup.opener = null;
      const target = popup.document;
      target.open();
      target.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
      target.close();
      target.title = title;
      target.documentElement.lang = document.documentElement.lang || 'ko';
      popup.addEventListener('afterprint', afterprint);
      const style = target.createElement('style');
      style.textContent = [
        'html,body { margin:0; padding:0; }',
        '.sheet { display:block; break-inside:avoid; break-after:page; position:relative; overflow:hidden; }',
        '.sheet:last-child { break-after:auto; }',
        '.sheet img { display:block; position:absolute; inset:0; width:100%; height:100%; }',
        ...plan.rules,
      ].join('\n');
      target.head.append(style);
      const pageRules = Array.from(style.sheet?.cssRules ?? []).filter(
        (rule) =>
          typeof popup.CSSPageRule === 'function' &&
          rule instanceof popup.CSSPageRule &&
          rule.style.getPropertyValue('size'),
      );
      if (pageRules.length !== plan.rules.length) throw Error('BrowserPrintNamedPagesUnavailable');

      const images = plan.pages.map(({ name, width, height, page }) => {
        const sheet = target.createElement('section');
        sheet.className = 'sheet';
        sheet.style.page = name;
        sheet.style.width = width;
        sheet.style.height = height;
        const image = target.createElement('img');
        image.alt = '';
        const url = realm.URL.createObjectURL(page.jpeg);
        urls.push(url);
        image.src = url;
        sheet.append(image);
        target.body.append(sheet);
        return { image, page };
      });
      const settled = Promise.all(
        images.map(async ({ image, page }) => {
          await image.decode();
          if (image.naturalWidth !== page.pixelWidth || image.naturalHeight !== page.pixelHeight)
            throw Error('BrowserPrintImageGeometryMismatch');
        }),
      );
      const deadline = new Promise((_, reject) => {
        timer = realm.setTimeout(
          () => reject(Error('BrowserPrintPrepareTimeout')),
          PREPARE_TIMEOUT_MS,
        );
      });
      await abortable(Promise.race([settled, deadline]), abort.signal);
      check();
      prepared = true;
    } catch (error) {
      close('prepare-failed');
      throw error;
    } finally {
      realm.clearTimeout(timer);
    }
  })();

  return Object.freeze({
    ready,
    close,
    print() {
      try {
        check();
        if (!prepared || invoked) throw Error('BrowserPrintTargetNotReady');
        if (typeof popup.print !== 'function') throw Error('BrowserPrintUnavailable');
        invoked = true;
        popup.focus();
        check();
        popup.print();
      } catch (error) {
        close('print-failed');
        throw error;
      }
    },
  });
}
