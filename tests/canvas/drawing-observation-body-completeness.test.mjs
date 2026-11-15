import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDrawingObservationQuery } from '../../web/preview/drawing-observation.mjs';
const original = JSON.parse(
  readFileSync(new URL('./fixtures/textbox-h5-public-observation.json', import.meta.url)),
);
const fixture = () => structuredClone(original);
const target = (content) => content.drawings[0];
function selected(content) {
  const row = target(content);
  const observation = createDrawingObservationQuery(content).get(row.section, row.drawingNode);
  assert(observation, 'selected transform and physical source owner remain complete');
  return observation;
}
function dropBody(content) {
  const row = target(content);
  content.hwp5DrawingBodies = content.hwp5DrawingBodies.filter(
    (body) => body.section !== row.section || body.ownerNode !== row.drawingNode,
  );
  content.paragraphs = content.paragraphs.filter(
    (p) => p.section !== row.section || p.drawingText?.drawingNode !== row.drawingNode,
  );
  content.currentParagraphFlows = content.currentParagraphFlows.filter(
    (flow) =>
      flow.section !== row.section ||
      flow.host !== 'drawing' ||
      flow.parent_node !== row.drawingNode,
  );
}
const noTextRectangle = () => {
  const content = fixture();
  dropBody(content);
  target(content).source.text = null;
  return content;
};
test('selected declared textbox body loss plus a target body error cannot report known empty', () => {
  const content = fixture();
  dropBody(content);
  content.hwp5DrawingBodyErrors.push({
    section: target(content).section,
    error: 'MissingHwp5DrawingBodyParagraph',
  });
  assert.deepEqual(selected(content).readText(), { state: 'unavailable' });
});
test('a declared list requires its actual body even if errors are empty or the declaration is malformed', () => {
  for (const change of [
    () => {},
    (c) => target(c).source.text.list_node++,
    (c) => delete target(c).source.text.list_node,
  ]) {
    const content = fixture();
    dropBody(content);
    change(content);
    assert.deepEqual(selected(content).readText(), { state: 'unavailable' });
  }
});
test('selected errors and missing error/body inventories precede the no-text rectangle shortcut', () => {
  for (const change of [
    (c) => c.hwp5DrawingBodyErrors.push({ section: target(c).section, error: 'IncompleteBody' }),
    (c) => c.hwp5DrawingBodyErrors.push({ error: 'UnknownPhysicalSection' }),
    (c) => delete c.hwp5DrawingBodyErrors,
    (c) => delete c.hwp5DrawingBodies,
  ]) {
    const content = noTextRectangle();
    change(content);
    assert.deepEqual(selected(content).readText(), { state: 'unavailable' });
  }
});
test('rectangle with explicit no-text source and complete error-free inventories remains available without a body', () => {
  assert.deepEqual(selected(noTextRectangle()).readText(), { state: 'available', paragraphs: [] });
});
test('an actual declared zero-paragraph owned body is distinct from a missing textbox observation', () => {
  const content = fixture(),
    row = target(content);
  const body = content.hwp5DrawingBodies.find(
    (body) => body.section === row.section && body.ownerNode === row.drawingNode,
  );
  content.paragraphs = content.paragraphs.filter(
    (p) => p.drawingText?.drawingNode !== row.drawingNode,
  );
  content.currentParagraphFlows = content.currentParagraphFlows.filter(
    (flow) => flow.parent_node !== row.drawingNode || flow.host !== 'drawing',
  );
  body.paragraphs = [];
  body.source.paragraph_count = 0;
  assert.deepEqual(selected(content).readText(), { state: 'available', paragraphs: [] });
});
test('other physical section errors with identical numeric owner ids do not blank a complete selected body', () => {
  const content = fixture(),
    row = target(content),
    otherSection = row.section + 1;
  const decoyBody = structuredClone(
    content.hwp5DrawingBodies.find((body) => body.ownerNode === row.drawingNode),
  );
  decoyBody.section = otherSection;
  content.hwp5DrawingBodies.push(decoyBody);
  const decoyParagraph = structuredClone(
    content.paragraphs.find((p) => p.drawingText?.drawingNode === row.drawingNode),
  );
  decoyParagraph.section = otherSection;
  decoyParagraph.text = 'unrelated body';
  content.paragraphs.push(decoyParagraph);
  content.hwp5DrawingBodyErrors.push({ section: otherSection, error: 'IncompleteDecoyBody' });
  const result = selected(content).readText();
  assert.equal(result.state, 'available');
  assert.deepEqual(
    result.paragraphs.map((p) => p.text),
    ['글상자'],
  );
  const rectangle = noTextRectangle();
  rectangle.hwp5DrawingBodyErrors.push({ section: otherSection, error: 'IncompleteDecoyBody' });
  assert.deepEqual(selected(rectangle).readText(), { state: 'available', paragraphs: [] });
});
test('selected-section unscoped errors remain fail-closed even when a selected body row survives', () => {
  const content = fixture();
  content.hwp5DrawingBodyErrors.push({
    section: target(content).section,
    error: 'IncompleteSectionBodyInventory',
  });
  assert.deepEqual(selected(content).readText(), { state: 'unavailable' });
});
test('transform/owner error inventories are scoped by physical section rather than their global nonempty length', () => {
  for (const name of [
    'hwp5DrawingErrors',
    'hwp5DrawingComponentErrors',
    'hwp5DrawingLocalErrors',
    'hwp5DrawingGeometryErrors',
    'hwp5DrawingMatrixErrors',
    'hwp5DrawingCornerErrors',
  ]) {
    const content = fixture(),
      row = target(content);
    content[name].push({ section: row.section + 1, error: 'UnrelatedPhysicalSection' });
    assert.equal(selected(content).readText().state, 'available', name);
    content[name].push({ section: row.section, error: 'SelectedPhysicalSection' });
    assert.equal(
      createDrawingObservationQuery(content).get(row.section, row.drawingNode),
      null,
      name,
    );
  }
});
test('HWPX declared source text without its owned paragraph observation is unavailable rather than a no-text rectangle', () => {
  const content = {
    format: 'hwpx',
    drawings: [
      {
        section: 0,
        drawingNode: 5,
        hostParagraph: 0,
        anchorUnit: 0,
        source: {
          drawing_node: 5,
          paragraph: 1,
          anchor_unit: 0,
          transform_identity: true,
          rendering: { angle: 0 },
          group_context: null,
          text: { node: 7, list_node: 8 },
        },
      },
    ],
    paragraphs: [],
  };
  const query = () => createDrawingObservationQuery(content).get(0, 5);
  assert.deepEqual(query().readText(), { state: 'unavailable' });
  content.drawings[0].source.text = null;
  assert.deepEqual(query().readText(), { state: 'available', paragraphs: [] });
  delete content.drawings[0].source.text;
  assert.deepEqual(query().readText(), { state: 'available', paragraphs: [] });
});
test('unrelated error attribution is indexed once per query rather than scanned again for every text read', () => {
  const content = fixture(),
    count = 500;
  let reads = 0;
  content.hwp5DrawingBodyErrors = new Proxy(
    Array.from({ length: count }, () => ({ section: 1, error: 'Unrelated' })),
    {
      get(array, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return Reflect.get(array, key, receiver);
      },
    },
  );
  const observation = selected(content);
  for (let i = 0; i < 40; i++) assert.equal(observation.readText().state, 'available');
  assert(reads <= count * 2, `scoped error work is bounded by entries, reads=${reads}`);
});
