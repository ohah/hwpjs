import { openBrowserPrintTarget } from './browser-print-target.mjs';
import { createPrintPdf } from './print-pdf.mjs';

const active = new WeakMap();

export function openPrintPreview(
  document,
  capture,
  { signal, filename = '문서.pdf', isCurrent = () => true } = {},
) {
  if (active.has(document)) throw Error('PrintPreviewAlreadyOpen');
  signal?.throwIfAborted();
  const realm = document.defaultView;
  const dialog = document.createElement('dialog');
  if (!realm || typeof dialog.showModal !== 'function') throw Error('PrintPreviewUnavailable');
  const cancel = new AbortController();
  const title = document.createElement('h2');
  const status = document.createElement('p');
  const toolbar = document.createElement('div');
  const image = document.createElement('img');
  const download = document.createElement('a');
  const makeButton = (text) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    return button;
  };
  const previous = makeButton('이전 쪽');
  const next = makeButton('다음 쪽');
  const close = makeButton('닫기');
  const print = makeButton('브라우저에서 인쇄');
  const invoker = document.activeElement;
  let job,
    pageUrl,
    pdfUrl,
    printTarget,
    ordinal = 0,
    ended = false;

  dialog.setAttribute('aria-label', '인쇄 미리보기');
  dialog.style.cssText = 'width:min(800px,90vw);max-height:90vh;padding:1rem;overflow:auto';
  toolbar.style.cssText =
    'display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin-bottom:.75rem';
  title.textContent = '인쇄 미리보기';
  status.role = 'status';
  status.textContent = '문서 페이지를 준비하는 중입니다.';
  image.style.cssText =
    'display:block;max-width:100%;max-height:65vh;object-fit:contain;margin:auto';
  image.hidden = true;
  image.style.display = 'none';
  previous.disabled = next.disabled = true;
  download.textContent = 'PDF 다운로드';
  download.hidden = true;
  print.disabled = true;
  close.autofocus = true;
  toolbar.append(previous, next, print, download, close);
  dialog.append(title, status, toolbar, image);

  const name = String(filename)
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_')
    .trim()
    .slice(0, 180);
  const update = () => {
    if (pageUrl) realm.URL.revokeObjectURL(pageUrl);
    const page = job.pages[ordinal];
    pageUrl = realm.URL.createObjectURL(page.jpeg);
    image.src = pageUrl;
    image.alt = `${ordinal + 1}쪽 미리보기`;
    image.hidden = false;
    image.style.display = 'block';
    status.textContent = `${ordinal + 1} / ${job.pages.length}쪽`;
    previous.disabled = ordinal === 0;
    next.disabled = ordinal === job.pages.length - 1;
  };
  const cleanup = () => {
    if (ended) return;
    ended = true;
    cancel.abort(Error('PrintPreviewClosed'));
    printTarget?.close();
    signal?.removeEventListener('abort', cleanup);
    if (pageUrl) realm.URL.revokeObjectURL(pageUrl);
    if (pdfUrl) realm.URL.revokeObjectURL(pdfUrl);
    job = null;
    active.delete(document);
    if (dialog.open) dialog.close();
    dialog.remove();
    if (invoker?.isConnected) invoker.focus?.();
  };
  download.addEventListener('click', (event) => {
    if (job && isCurrent(job.token)) return;
    event.preventDefault();
    status.textContent = '문서가 변경됐습니다. 미리보기를 다시 열어 주세요.';
    download.hidden = true;
    print.disabled = true;
  });
  print.addEventListener('click', async () => {
    if (!job || printTarget) return;
    if (!isCurrent(job.token)) {
      status.textContent = '문서가 변경됐습니다. 미리보기를 다시 열어 주세요.';
      print.disabled = true;
      download.hidden = true;
      return;
    }
    print.disabled = true;
    status.textContent = '브라우저 인쇄를 준비하는 중입니다.';
    let target;
    try {
      target = openBrowserPrintTarget(document, job, {
        signal: cancel.signal,
        title: name || '문서 인쇄',
        isCurrent,
        onClose(reason) {
          printTarget = null;
          if (ended) return;
          if (reason === 'afterprint' || reason === 'target-closed') update();
          print.disabled = !job || !isCurrent(job.token);
        },
      });
      printTarget = target;
      await target.ready;
      if (ended || printTarget !== target) return;
      status.textContent = '브라우저 인쇄 창에서 인쇄 또는 취소를 선택해 주세요.';
      target.print();
    } catch (error) {
      if (printTarget === target) printTarget = null;
      if (ended) return;
      if (error.message === 'StalePrintDocument') {
        status.textContent = '문서가 변경됐습니다. 미리보기를 다시 열어 주세요.';
        download.hidden = true;
      } else status.textContent = `브라우저 인쇄를 열지 못했습니다. ${error.message}`;
      print.disabled = !job || !isCurrent(job.token);
    }
  });
  close.addEventListener('click', cleanup);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cleanup();
  });
  dialog.addEventListener('close', cleanup);
  previous.addEventListener('click', () => {
    if (job && ordinal > 0) {
      ordinal--;
      update();
    }
  });
  next.addEventListener('click', () => {
    if (job && ordinal + 1 < job.pages.length) {
      ordinal++;
      update();
    }
  });
  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch (error) {
    cleanup();
    throw error;
  }
  active.set(document, dialog);
  signal?.addEventListener('abort', cleanup, { once: true });
  if (signal?.aborted) cleanup();
  const ready = (async () => {
    try {
      cancel.signal.throwIfAborted();
      const result = await capture({ signal: cancel.signal, encoding: 'jpeg', scale: 2 });
      const encoded = await createPrintPdf(result, { signal: cancel.signal });
      cancel.signal.throwIfAborted();
      if (!isCurrent(result.token)) throw Error('StalePrintDocument');
      job = result;
      pdfUrl = realm.URL.createObjectURL(encoded);
      download.href = pdfUrl;
      download.download = /\.pdf$/i.test(name) ? name : `${name || '문서'}.pdf`;
      download.hidden = false;
      print.disabled = false;
      update();
      return true;
    } catch (error) {
      if (!ended) status.textContent = `출력을 준비하지 못했습니다. ${error.message}`;
      return false;
    }
  })();
  return Object.freeze({ close: cleanup, ready });
}
