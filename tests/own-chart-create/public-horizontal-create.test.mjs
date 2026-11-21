import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import * as core from '../../packages/hwpjs/dist/index.js';
import * as runtime from '../../packages/hwpjs/dist/runtime.js';
import { createNewDocumentBytes } from '../../js/new-document.mjs';

// Controlled encoder for the public SDK transport test. Browser tests use
// Chromium's native encoder to verify the actual image stored by the Worker.
function raster(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  function chunk(name, data) {
    const bytes = Buffer.alloc(12 + data.length);
    bytes.writeUInt32BE(data.length);
    bytes.write(name, 4);
    bytes.set(data, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
    return bytes;
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('public reader dispatch creates a horizontal HWP5 chart and reopens the same data', async () => {
  const wasm = await readFile(new URL('../../packages/hwpjs/dist/hwpjs.wasm', import.meta.url));
  assert.match(process.env.HWPJS_TEST_WASM_EXPECTED_SHA256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(
    createHash('sha256').update(wasm).digest('hex'),
    process.env.HWPJS_TEST_WASM_EXPECTED_SHA256,
  );
  const initialCanvas = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  const filled = [];
  class ControlledCanvas {
    getContext() {
      return new Proxy(
        {},
        {
          get(target, key) {
            if (Object.hasOwn(target, key)) return target[key];
            if (key === 'measureText') return (text) => ({ width: text.length * 6 });
            if (key === 'fillRect') return (...bounds) => filled.push(bounds);
            return () => {};
          },
        },
      );
    }
    async convertToBlob({ type }) {
      return new Blob([raster(this.width, this.height)], { type });
    }
  }
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    writable: true,
    value: ControlledCanvas,
  });
  let editor;
  try {
    const module = await runtime.createWasmModuleLoader({
      fetch: async () => new Response(wasm),
    })();
    editor = core.createEditor({
      runtimeFactory: runtime.createReaderRuntimeFactory({ wasmModule: module }),
    });
    const input = await createNewDocumentBytes(module, 'hwp5');
    const load = (bytes) => editor.load(bytes, { format: 'hwp5', editable: true });
    const state = () => editor.getEditorState();
    const save = async (allowStaleLayout) => (await editor.save({ allowStaleLayout })).bytes;
    await load(input);
    const first = state().content.paragraphs[0];
    assert.equal(state().content.hwp5ChartCreateProfileVersion, 3);
    assert.equal(state().content.chartCreationAvailable, true);
    await editor.setSelection(
      core.createParagraphSelection(state(), {
        section: first.section,
        paragraph: first.paragraph,
        startUnit: first.text.length,
      }),
    );
    const payload = {
      target: state().selection,
      selectionVersion: state().stateVersion,
      options: {
        profile: 'spec24-registered-png-presentation-horizontal-bar-v1',
        width: 20000,
        height: 12000,
        preview: { width: 267, height: 160 },
        categories: ['가', '나', '다'],
        series: [{ name: '값', values: [3, -2, 7] }],
      },
    };
    const response = await editor.readResource(
      core.hwp5ChartCreatePreviewMessage(payload, state()),
    );
    const preview = JSON.parse(new TextDecoder().decode(response.preview)).data;
    assert.equal(preview.plots[0].kind, 'barChart');
    assert.equal(preview.plot_settings[0].direction.value, 'bar');
    assert.equal(preview.plot_settings[0].grouping.value, 'clustered');
    assert.equal(filled.length, 0);
    const outcome = await editor.dispatchCommand(core.CREATE_CHART_COMMAND, payload);
    assert.equal(outcome.status, 'committed-with-snapshot');
    assert.equal(state().nativeHistoryRevision, 1);
    assert.equal(filled.length, 3);
    const edited = await save(true);
    await editor.undo();
    assert.deepEqual(await save(false), input);
    await editor.redo();
    assert.deepEqual(await save(true), edited);
    await load(edited);
    const [chart, other] = state().content.hwp5ChartTargets;
    assert.equal(other, undefined);
    const display = await editor.readResource({
      kind: 'hwp5-chart-display',
      section: chart.section,
      controlNode: chart.controlNode,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(display.chart.data)), preview);
    assert.deepEqual(await save(false), edited);
  } finally {
    await editor?.dispose();
    if (initialCanvas) Object.defineProperty(globalThis, 'OffscreenCanvas', initialCanvas);
    else delete globalThis.OffscreenCanvas;
  }
});
