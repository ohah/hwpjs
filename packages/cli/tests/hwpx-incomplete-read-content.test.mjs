import { controlTextWire } from './control-text-wire-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocumentModel } from '../src/document-model.ts';
import { renderDocument } from '../src/render.ts';
import { readDocumentOperation, renderReadResponse } from '../src/read-operation.ts';
const sha = 'c'.repeat(64);
const modes = [
  ['missing', 'ControlAwareBatchUnavailable'],
  ['throw', 'ControlAwareBatchUnavailable'],
  ['owner', 'ControlAwareOwnerUnverified'],
  ['mismatch', 'ControlAwareTextMismatch'],
];
for (const [mode, code] of modes)
  for (const format of ['text', 'markdown']) {
    test(`${format} content CLI wrapper exposes ${mode} fallback and keeps literal FFFC plus standalone reference`, async () => {
      const sdk = {
        paragraphTextSnapshot: () => [{ paragraph: 4, text: 'A\ufffcB' }],
        paragraphFlow: () =>
          mode === 'owner'
            ? []
            : [{ paragraph: 4, source_node: 31, host: 'body', top_level: true }],
        paragraphControlTextSnapshot() {
          if (mode === 'throw') throw Error('/private/host/source MustNotLeak');
          return controlTextWire({ plain: 'WRONG', text: 'WRONG' });
        },
        tableBindings: () => [],
        tablePlacements: () => [],
        tableBorderSources: () => ({ cells: [] }),
        pageAreaDeclarations: () => [],
        pictureSites: () => [],
        pictureOwners: () => [],
        chartSites: () => [{ wrapper: 36, paragraph: 4, anchorUnit: 1, error_name: null }],
        equationSites: () => [],
        oleSites: () => [],
        rectangleNodes: () => [],
        lineNodes: () => [],
        connectorNodes: () => [],
        ellipseSources: () => [],
        drawingTextBindings: () => [],
      };
      if (mode === 'missing') delete sdk.paragraphControlTextSnapshot;
      const model = await readDocumentModel({
        format: 'hwpx',
        sourceSha256: sha,
        sectionCount: 1,
        sdk,
      });
      const result = await readDocumentOperation(
        { inputSnapshot: { bytes: Uint8Array.of(1), sha256: sha }, wasm: Uint8Array.of(0), format },
        {
          files: {
            readInputSnapshot() {
              assert.fail('injected immutable snapshot only');
            },
          },
          engine: { read: () => ({ format: 'hwpx', model }) },
          renderDocument,
          loadWasm() {
            assert.fail('controlled only, no WASM load');
          },
        },
      );
      const stdout = renderReadResponse(result);
      assert(stdout.includes('A\ufffcB'));
      assert(stdout.includes(`부분 읽기: ${code}`));
      assert(stdout.includes('본문 텍스트는 보존해 읽었습니다'));
      assert(stdout.includes('구역 0'));
      assert(stdout.includes('대표 Native 문단 4'));
      assert(stdout.includes('영향 문단 1개'));
      assert.equal(stdout.split('/chart/36').length - 1, 1);
      assert(!stdout.includes('/private/host'));
    });
  }
test('repeated same-scope fallback diagnostic prints once and shares the output budget', () => {
  const empty = { declarations: 'known', definitions: [], inheritance: { state: 'unresolved' } };
  const warning = {
    code: 'ControlAwareBatchUnavailable',
    message: 'private diagnostic not echoed',
    source: { section: 0, paragraph: 4 },
  };
  const model = {
    version: 1,
    format: 'hwpx',
    sourceSha256: sha,
    sections: [
      {
        id: 's0',
        source: { section: 0 },
        header: structuredClone(empty),
        body: [],
        footer: structuredClone(empty),
      },
    ],
    unplaced: [],
    warnings: [warning, { ...warning }],
    coverage: { inventoryComplete: true },
  };
  const out = renderDocument(model, { format: 'text' });
  assert.equal(out.split('부분 읽기: ControlAwareBatchUnavailable').length - 1, 1);
  assert.throws(
    () => renderDocument(model, { format: 'text', maxOutputUnits: 32 }),
    /RenderOutputLimitExceeded/,
  );
});
