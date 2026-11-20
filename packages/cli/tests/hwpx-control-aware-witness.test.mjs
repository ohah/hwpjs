import { controlTextWire, marker } from './control-text-wire-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocumentModel } from '../src/document-model.ts';
import { renderDocument } from '../src/render.ts';
const hash = 'b'.repeat(64);
const plain = 'A\ufffcB';
const nativeFull = 'A\ufffc\ufffcB';
function fixture(mode, sections = 1) {
  let calls = 0;
  const sdk = {
    paragraphTextSnapshot: (s) => [{ paragraph: 4 + s * 4, text: plain, nested: false }],
    paragraphFlow: (s) => [
      {
        paragraph: (mode === 'ordinal-mismatch' ? 9 : 4) + s * 4,
        source_node: 31,
        host: 'body',
        top_level: true,
      },
    ],
    paragraphControlTextSnapshot(s) {
      calls++;
      if (mode === 'throw' || (mode === 'mixed' && s === 1))
        throw Error('HwpxAnchorEditAbiUnavailable');
      return controlTextWire({
        section: s,
        paragraph: 4 + s * 4,
        plain,
        text: nativeFull,
        controls: [marker('anchor', 36, 1)],
      });
    },
    tableBindings: () => [],
    tablePlacements: () => [],
    tableBorderSources: () => ({ cells: [] }),
    pageAreaDeclarations: () => [],
    pictureSites: () => [],
    pictureOwners: () => [],
    chartSites: (s) => [{ wrapper: 36, paragraph: 4 + s * 4, anchorUnit: 1, error_name: null }],
    equationSites: () => [],
    oleSites: () => [],
    rectangleNodes: () => [],
    lineNodes: () => [],
    connectorNodes: () => [],
    ellipseSources: () => [],
    drawingTextBindings: () => [],
  };
  if (mode === 'missing') delete sdk.paragraphControlTextSnapshot;
  return {
    async model() {
      return readDocumentModel({ format: 'hwpx', sourceSha256: hash, sectionCount: sections, sdk });
    },
    calls: () => calls,
  };
}
for (const mode of ['missing', 'throw', 'ordinal-mismatch']) {
  for (const format of ['text', 'markdown'])
    test(`literal FFFC plus ${mode} fallback stays plain with standalone reference in ${format}`, async () => {
      const f = fixture(mode);
      const model = await f.model();
      const output = renderDocument(model, { format });
      assert(output.includes(plain), 'fallback literal U+FFFC must not become a Native control');
      assert.equal(output.split('\ufffc').length - 1, 1);
      const ref = `hwpjs-object:${hash}/hwpx/s0/chart/36`;
      assert.equal(output.split(ref).length - 1, 1);
      assert(
        output.indexOf(plain) < output.indexOf(ref),
        'standalone reference follows intact plain text',
      );
      if (mode !== 'throw') assert.equal(f.calls(), 0);
      else assert.equal(f.calls(), 1);
    });
}
for (const format of ['text', 'markdown'])
  test(`successful Native axis replaces only actual object FFFC and retains literal FFFC in ${format}`, async () => {
    const f = fixture('success');
    const model = await f.model();
    const output = renderDocument(model, { format });
    assert.equal(f.calls(), 1);
    assert.equal(output.split('\ufffc').length - 1, 1);
    assert(!output.includes(plain));
    const ref = `hwpjs-object:${hash}/hwpx/s0/chart/36`;
    assert.equal(output.split(ref).length - 1, 1);
    assert(output.indexOf(ref) < output.indexOf('\ufffcB'));
  });
test('a successful paragraph witness cannot authorize the other-section fallback', async () => {
  const model = await fixture('mixed', 2).model();
  const output = renderDocument(model, { format: 'text' });
  assert.equal(output.split('\ufffc').length - 1, 2);
  assert(output.includes(plain));
  for (const s of [0, 1])
    assert.equal(output.split(`hwpjs-object:${hash}/hwpx/s${s}/chart/36`).length - 1, 1);
});
test('serialized or copied model metadata cannot reissue a successful Native witness', async () => {
  const model = await fixture('success').model();
  const copied = JSON.parse(JSON.stringify(model));
  const output = renderDocument(copied, { format: 'text' });
  assert(output.includes(nativeFull));
  assert.equal(output.split('\ufffc').length - 1, 2);
  assert.equal(output.split(`/chart/36`).length - 1, 1);
});
test('a getter on fallback text cannot retag it as a successful Native axis', async () => {
  const model = await fixture('missing').model();
  const paragraph = model.sections[0].body.find((b) => b.type === 'paragraph');
  Object.defineProperty(paragraph, 'displayText', {
    get() {
      return nativeFull;
    },
  });
  const output = renderDocument(model, { format: 'text' });
  assert(output.includes(nativeFull));
  assert.equal(output.split('\ufffc').length - 1, 2);
});
test('later mutation of a successful paragraph axis invalidates only inline authority', async () => {
  const model = await fixture('success').model();
  const paragraph = model.sections[0].body.find((b) => b.type === 'paragraph');
  paragraph.displayText = plain;
  const output = renderDocument(model, { format: 'text' });
  assert(output.includes(plain));
  assert.equal(output.split('/chart/36').length - 1, 1);
});
