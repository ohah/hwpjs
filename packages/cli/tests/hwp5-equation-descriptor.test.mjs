import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocumentModel } from '../../document/src/document-model.ts';
const hash = 'a'.repeat(64);
const site = () => ({
  equationNode: 9,
  controlNode: 8,
  paragraphNode: 7,
  paragraph: 0,
  sourceUnit: 0,
  currentUnit: 16,
});
function sdk(rows = [site()]) {
  return {
    paragraphCount: () => 1,
    currentTextPreview: () => ({
      sections: [
        {
          index: 0,
          paragraphs: [
            {
              nodeIndex: 7,
              text: '',
              textPresent: true,
              tokens: [{ type: 'control', code: 11, startUnit: 16 }],
            },
          ],
        },
      ],
    }),
    paragraphFlow: () => [
      { paragraph: 0, source_node: 7, generated: false, host: 'body', top_level: true },
    ],
    tableBindings: () => [],
    tablePlacements: () => [],
    tableLayoutSources: () => [],
    cellLayoutSources: () => [],
    pageAreaSources: () => [],
    tableAnchors: () => [],
    drawingSources: () => [],
    drawingAnchors: () => [],
    drawingComponentSources: () => [],
    pictureSources: () => [],
    equationSites: () => rows,
    equationSnapshot: () => {
      throw Error('MustNotReadEquationPayload');
    },
    save: () => {
      throw Error('MustNotSave');
    },
  };
}
const read = (source) =>
  readDocumentModel({ format: 'hwp5', sourceSha256: hash, sectionCount: 1, sdk: source });
function objects(model) {
  return [...model.sections.flatMap((s) => s.body), ...model.unplaced.map((r) => r.block)].filter(
    (b) => b.type === 'unknown',
  );
}
test('typed H5 equation uses physical identity and current anchor without payload guessing', async () => {
  const blocks = objects(await read(sdk()));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'equation');
  assert.equal(blocks[0].reference, `hwpjs-object:${hash}/hwp5/s0/equation/9`);
  assert.deepEqual(blocks[0].source, { section: 0, node: 9, paragraph: 0, anchorUnit: 16 });
});
for (const [name, rows] of [
  ['ordinary extended control', []],
  ['duplicate site', [site(), site()]],
  ['wrong paragraph owner', [{ ...site(), paragraphNode: 6 }]],
  ['stale current anchor', [{ ...site(), currentUnit: 0 }]],
  ['negative zero', [{ ...site(), paragraph: -0 }]],
  ['invalid node order', [{ ...site(), equationNode: 8 }]],
])
  test(name + ' cannot become a typed equation', async () => {
    const blocks = objects(await read(sdk(rows)));
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].kind, 'unknown');
    assert.equal(blocks[0].reference, null);
  });
test('old ABI without equation query retains unknown signal', async () => {
  const source = sdk();
  delete source.equationSites;
  assert.equal(objects(await read(source))[0].kind, 'unknown');
});
test('disagreeing paragraph identity cannot grant equation reference', async () => {
  const source = sdk();
  source.paragraphFlow = () => [{ paragraph: 0, source_node: 6 }];
  assert.equal(objects(await read(source))[0].reference, null);
});

test('content and structure both expose the typed equation reference', async () => {
  const { renderDocument } = await import('../../document/src/render.ts');
  const model = await read(sdk());
  for (const view of ['content', 'structure']) {
    const output = renderDocument(model, { format: 'markdown', view });
    const prefix = view === 'structure' ? 'hwpjs\\-object:' : 'hwpjs-object:';
    assert.ok(output.includes(`${prefix}${hash}/hwp5/s0/equation/9`), `${view}: ${output}`);
    assert.ok(!output.includes('UnclassifiedExtendedObject'));
  }
});
test('HWPX existing typed equation projection remains unchanged', async () => {
  const model = await readDocumentModel({
    format: 'hwpx',
    sourceSha256: hash,
    sectionCount: 1,
    sdk: {
      paragraphTextSnapshot: () => [{ paragraph: 1, text: '', nested: false }],
      paragraphFlow: () => [{ paragraph: 1, source_node: 1, host: 'body', top_level: true }],
      tableBindings: () => [],
      tablePlacements: () => [],
      tableBorderSources: () => ({ cells: [], styles: [] }),
      pageAreaDeclarations: () => [],
      pictureSites: () => [],
      pictureOwners: () => [],
      equationSites: () => [
        { source: { node: 17, issue: null }, paragraph: 1, anchor_unit: 0, error_name: null },
      ],
    },
  });
  const equation = objects(model).find((b) => b.kind === 'equation');
  assert.equal(equation.reference, `hwpjs-object:${hash}/hwpx/s0/equation/17`);
});
