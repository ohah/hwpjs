import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeasuredPlainLayoutSaver } from '../../packages/core/src/browser/strict-layout-save.ts';
import { bindStrictLayoutSaveBridge } from '../../packages/core/src/internal/strict-layout-save.ts';
for (const kind of ['abort', 'document-replacement']) {
  test(`direct save promise keeps ${kind} after late font load rejection and releases lease`, async () => {
    const previousDocument = globalThis.document,
      previousFace = globalThis.FontFace;
    const listeners = new Set(),
      fonts = new Set();
    let rejectLoad, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    class Face {
      constructor(family) {
        this.family = family;
        this.status = 'unloaded';
      }
      load() {
        return new Promise((_resolve, reject) => {
          rejectLoad = reject;
          entered();
        });
      }
    }
    globalThis.document = { fonts };
    globalThis.FontFace = Face;
    let documentId = 'first',
      cancels = 0,
      finished = 0,
      commits = 0,
      publications = 0;
    const editor = {
      getEditorState: () => ({ documentId, status: 'ready' }),
      registerStateListener: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    bindStrictLayoutSaveBridge(editor, {
      available: () => true,
      prepare: async () => ({
        snapshot: { paragraphs: [{ font: 'Noto Sans KR', bold: false, italic: false }] },
      }),
      check() {},
      cancel: async () => {
        cancels++;
      },
      finish: () => {
        finished++;
      },
      commit: async () => {
        commits++;
        throw Error('unexpected commit');
      },
      publish: () => {
        publications++;
      },
    });
    const saver = createMeasuredPlainLayoutSaver(editor),
      abort = new AbortController();
    try {
      const bytes = new Uint8Array([0x4f, 0x54, 0x54, 0x4f]).buffer;
      const pending = saver.save({
        signal: abort.signal,
        fontFile: { name: 'own.otf', size: 4, arrayBuffer: async () => bytes },
        publish: () => {
          publications++;
        },
      });
      await started;
      const reason = new DOMException('explicit cancellation', 'AbortError');
      if (kind === 'abort') abort.abort(reason);
      else {
        documentId = 'second';
        for (const fn of listeners) fn(editor.getEditorState());
      }
      rejectLoad(new DOMException('Invalid font data in ArrayBuffer.', 'SyntaxError'));
      await assert.rejects(pending, (error) => {
        if (kind === 'abort') assert.equal(error, reason);
        else assert.equal(error.message, 'StrictLayoutMeasurementExpired');
        assert.notEqual(error.message, 'StrictFontDecodeFailed');
        assert.equal('fontProfile' in error, false);
        return true;
      });
      assert.ok(cancels >= 1);
      assert.equal(finished, 1);
      assert.equal(commits, 0);
      assert.equal(publications, 0);
      assert.equal(fonts.size, 0);
      assert.equal(saver.available(), true);
    } finally {
      saver.dispose();
      assert.equal(listeners.size, 0);
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      if (previousFace === undefined) delete globalThis.FontFace;
      else globalThis.FontFace = previousFace;
    }
  });
}
