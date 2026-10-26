import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHwp5Styles } from '../../web/preview/hwp5-style-content.mjs';

test('style query success clears an earlier session open failure', () => {
  const shapes = [{ height: 1000 }];
  const content = attachHwp5Styles(
    { characterShapes: () => shapes },
    { sections: [] },
    { paragraphs: [] },
    'RepairedSourceUnsupported',
  );
  assert.equal(content.characterShapes, shapes);
  assert.equal(content.characterShapesError, null);
});
test('style query failure replaces rather than hides the earlier open error', () => {
  const content = attachHwp5Styles(
    {
      characterShapes() {
        throw Error('CurrentStyleFailure');
      },
    },
    { sections: [] },
    { paragraphs: [] },
    'RepairedSourceUnsupported',
  );
  assert.equal(content.characterShapes, null);
  assert.equal(content.characterShapesError, 'CurrentStyleFailure');
});
test('absent editor retains its open failure without stale shape data', () => {
  const content = attachHwp5Styles(
    null,
    { sections: [] },
    { paragraphs: [], characterShapes: [{}], characterShapesError: null },
    'RepairedSourceUnsupported',
  );
  assert.equal(content.characterShapes, null);
  assert.equal(content.characterShapesError, 'RepairedSourceUnsupported');
});
