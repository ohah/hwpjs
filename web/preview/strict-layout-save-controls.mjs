import { createBrowserStrictLayoutSaver } from '../../js/hwp5-browser-strict-layout.mjs';
import { createStrictLayoutFontOwner } from './strict-layout-font.mjs';
import { strictLayoutKinds } from './strict-layout-worker.mjs';

// Explicit UI action only. Default save/Ctrl+S never call this controller.
export function createStrictLayoutSaveControls({
  button,
  fontInput,
  note,
  current,
  canRequest,
  consent,
  publish,
  browser = globalThis,
}) {
  let operation = 0,
    sequence = 0,
    busy = false,
    available = false,
    closed = false;
  let activeContext;
  const waiting = new Map(),
    fonts = createStrictLayoutFontOwner(browser);
  function update() {
    button.disabled = closed || busy || !available || current().format !== 'hwp5' || !canRequest();
    fontInput.disabled = closed || busy || current().format !== 'hwp5';
  }
  function rpc(context, kind, payload = {}) {
    check(context);
    const requestId = `strict-layout-ui-${++sequence}`;
    if (kind === 'strict-layout-prepare') context.prepareRequestId = requestId;
    return new Promise((resolve, reject) => {
      const timer = browser.setTimeout(() => {
        waiting.delete(requestId);
        reject(Error('StrictLayoutWorkerTimeout'));
      }, 15000);
      waiting.set(requestId, { kind, resolve, reject, timer });
      try {
        context.worker.postMessage({
          kind,
          origin: 'strict-layout-download',
          requestId,
          ...payload,
        });
      } catch (error) {
        waiting.delete(requestId);
        browser.clearTimeout(timer);
        reject(error);
      }
    });
  }
  function check(context) {
    const now = current();
    if (
      closed ||
      context.operation !== operation ||
      context.worker !== now.worker ||
      context.generation !== now.generation ||
      !canRequest()
    )
      throw Error('StrictLayoutMeasurementExpired');
  }
  function reset(clearFont = true) {
    const wasBusy = busy;
    if (activeContext) {
      try {
        activeContext.worker.postMessage({
          kind: 'strict-layout-cancel',
          origin: 'strict-layout-download',
          ticket: activeContext.ticket,
          prepareRequestId: activeContext.prepareRequestId,
        });
      } catch {
        /* The retired worker owns its memory. */
      }
      activeContext = undefined;
    }
    operation++;
    busy = false;
    button.dataset.state = clearFont ? 'idle' : wasBusy ? 'cancelled' : 'idle';
    if (wasBusy && !clearFont)
      note.textContent = '다른 요청으로 측정을 취소했습니다. 준비된 뒤 다시 시도하세요.';
    for (const entry of waiting.values()) {
      browser.clearTimeout(entry.timer);
      entry.reject(Error('StrictLayoutMeasurementExpired'));
    }
    waiting.clear();
    if (clearFont) {
      fonts.clear();
      fontInput.value = '';
      available = false;
    }
    update();
  }
  async function request() {
    update();
    if (button.disabled) return false;
    const context = { ...current(), operation: ++operation };
    let ticket;
    activeContext = context;
    busy = true;
    button.dataset.state = 'measuring';
    update();
    note.textContent = '본문과 글꼴을 측정하고 있습니다.';
    try {
      const prepared = await rpc(context, 'strict-layout-prepare', {
        allowUnprotectedOutput: consent(),
      });
      context.fontFamily = prepared.snapshot?.paragraphs?.[0]?.font;
      ticket = prepared.ticket;
      context.ticket = ticket;
      if (typeof ticket !== 'string') throw Error('InvalidStrictLayoutTicket');
      const font = await fonts.acquire(prepared.snapshot, fontInput.files?.[0], () =>
        check(context),
      );
      let didPublish = false;
      const save = createBrowserStrictLayoutSaver({
        prepare: () => prepared.snapshot,
        check: () => check(context),
        publish(saved) {
          check(context);
          if (
            !(saved.bytes instanceof Uint8Array) ||
            saved.format !== 'hwp5' ||
            saved.layoutRequiresReflow !== false
          )
            throw Error('InvalidStrictMeasuredSave');
          publish(saved, context.name);
          didPublish = true;
        },
        commit: (lines) =>
          rpc(context, 'strict-layout-commit', {
            ticket,
            lines,
            allowUnprotectedOutput: consent(),
          }),
        cancel: async () => {
          if (context.operation === operation && current().worker === context.worker)
            await rpc(context, 'strict-layout-cancel', { ticket });
        },
      });
      await save({ fontFace: font.face });
      if (!didPublish) throw Error('StrictLayoutNotPublished');
      if (context.operation === operation) {
        button.dataset.state = 'saved';
        note.textContent = '측정값으로 편집본을 저장했습니다.';
      }
      return true;
    } catch (error) {
      if (context.operation === operation) {
        button.dataset.state = 'failed';
        note.textContent =
          error.message === 'ChooseMatchingFontFile'
            ? `원문 글꼴 ${context.fontFamily ?? ''}에 맞는 파일을 선택한 뒤 측정 저장을 누르세요.`
            : `측정 저장 실패: ${error.message || error}`;
      }
      return false;
    } finally {
      // Includes prepare/font-load failures before the producer owned cleanup.
      if (ticket && context.operation === operation && current().worker === context.worker) {
        try {
          context.worker.postMessage({
            kind: 'strict-layout-cancel',
            origin: 'strict-layout-download',
            ticket,
          });
        } catch {
          /* Worker termination already releases ownership. */
        }
      }
      if (context.operation === operation) {
        activeContext = undefined;
        busy = false;
        update();
      }
    }
  }
  const change = () => {
    fonts.clear();
    reset(false);
  };
  button.addEventListener('click', request);
  fontInput.addEventListener('change', change);
  update();
  return {
    request,
    update,
    reset() {
      reset();
    },
    beforeSend(message) {
      if (busy && !strictLayoutKinds.has(message.kind)) reset(false);
    },
    message(message) {
      if (!strictLayoutKinds.has(message?.kind)) {
        if (message.content) available = message.content.strictMeasuredSaveAvailable === true;
        if (message.historyPoisoned) available = false;
        update();
        return false;
      }
      const pending = waiting.get(message.requestId);
      if (pending && pending.kind === message.kind && message.origin === 'strict-layout-download') {
        waiting.delete(message.requestId);
        browser.clearTimeout(pending.timer);
        if (message.error) pending.reject(Error(message.error));
        else pending.resolve(message);
      }
      return true;
    },
    close() {
      closed = true;
      reset();
      button.removeEventListener('click', request);
      fontInput.removeEventListener('change', change);
    },
  };
}
