import { controlTextWire, marker } from './control-text-wire-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocumentModel } from '../src/document-model.ts';
import { renderDocument } from '../src/render.ts';
const hash = 'e'.repeat(64),
  plain = 'A\ufffcB',
  nativeFull = 'A\ufffc\ufffcB';
async function issued() {
  const sdk = {
    paragraphTextSnapshot: () => [{ paragraph: 4, text: plain }],
    paragraphFlow: () => [{ paragraph: 4, source_node: 31, host: 'body', top_level: true }],
    paragraphControlTextSnapshot: () =>
      controlTextWire({ plain, text: nativeFull, controls: [marker('anchor', 36, 1)] }),
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
  return readDocumentModel({ format: 'hwpx', sourceSha256: hash, sectionCount: 1, sdk });
}
for (const format of ['text', 'markdown'])
  test(`${format} success witness cannot authorize the fifth-read plain value of a self-replacing getter`, async () => {
    const model = await issued();
    const block = model.sections[0].body.find((b) => b.type === 'paragraph');
    let reads = 0;
    Object.defineProperty(block, 'displayText', {
      configurable: true,
      get() {
        reads++;
        if (reads <= 4) return nativeFull;
        Object.defineProperty(block, 'displayText', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: nativeFull,
        });
        return plain;
      },
    });
    const output = renderDocument(model, { format });
    assert.equal(reads, 5);
    assert(output.includes(plain), 'actual consumed fallback axis must retain the literal FFFC');
    assert.equal(output.split('\ufffc').length - 1, 1);
    const ref = `hwpjs-object:${hash}/hwpx/s0/chart/36`;
    assert.equal(output.split(ref).length - 1, 1);
    assert(
      output.indexOf(plain) < output.indexOf(ref),
      'reference must remain standalone on the accessor-captured axis',
    );
  });
for (const format of ['text', 'markdown'])
  test(`${format} an unchanged issued own-data Native axis still places only its actual control`, async () => {
    const model = await issued();
    const output = renderDocument(model, { format });
    assert.equal(output.split('\ufffc').length - 1, 1);
    assert(!output.includes(plain));
    assert(output.indexOf('/chart/36') < output.indexOf('\ufffcB'));
  });
