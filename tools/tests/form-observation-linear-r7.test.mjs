import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineCheckBoxIndex } from '../../web/preview/checkbox-inline-layout.mjs';
import { attachCheckBoxes } from '../../web/preview/checkbox-content.mjs';
for (const n of [32, 64, 128, 256])
  test(`R7 Canvas borrowed row lookup has linear property visits N${n}`, () => {
    let visits = 0;
    const paragraphs = Array.from({ length: n }, (_, paragraph) => ({
      get section() {
        visits++;
        return 0;
      },
      paragraph,
      text: '\ufffc',
    }));
    const checkBoxes = Array.from({ length: n }, (_, paragraph) => ({
      section: 0,
      paragraph,
      anchorUnit: 0,
      siteState: 'located',
      formNode: paragraph,
    }));
    const result = inlineCheckBoxIndex({ paragraphs, checkBoxes });
    assert(visits >= n && visits <= 3 * n, `nonlinear visits=${visits}, N=${n}`);
    assert.equal(result.unavailable.length, n);
    assert(result.unavailable.every((r) => r.reason === 'UnsupportedFormDimensions'));
  });
test('R7 Canvas duplicate coordinates keep first match and NaN does not match', () => {
  const row = { section: 0, paragraph: 0, anchorUnit: 0, siteState: 'located', formNode: 7 };
  const duplicate = inlineCheckBoxIndex({
    paragraphs: [
      { section: 0, paragraph: 0, text: 'first' },
      { section: 0, paragraph: 0, text: '\ufffc' },
    ],
    checkBoxes: [row],
  });
  assert.equal(duplicate.unavailable[0].reason, 'MissingFormDisplayAnchor');
  const nan = inlineCheckBoxIndex({
    paragraphs: [{ section: NaN, paragraph: 0, text: '\ufffc' }],
    checkBoxes: [{ ...row, section: NaN }],
  });
  assert.equal(nan.unavailable[0].reason, 'MissingFormDisplayAnchor');
});
test('R7 legacy optional scope absence preserves current source getters', () => {
  const calls = [],
    editor = {
      supportsFormTextEdit: () => true,
      supportsFormTextLayoutRetention: () => true,
      formSites: () => [
        { formNode: 5, paragraph: 1, kind: 'edit_box', anchorUnit: 0, state: 'located' },
      ],
      formSourceLayout: () => ({}),
      formSourceAttributes: () => ({
        strings: {},
        booleans: { enabled: true, editable: true, readOnly: false },
      }),
      formText: (section, node) => {
        calls.push([section, node]);
        return 'source😀';
      },
    };
  const content = { paragraphs: [{ section: 0, paragraph: 0 }] };
  attachCheckBoxes(editor, content, true);
  assert.equal(content.formTexts[0].caption, 'source😀');
  assert.deepEqual(calls, [[0, 5]]);
  const scoped = [];
  editor.withReadObservations = (section, cb) => {
    scoped.push(section);
    return cb();
  };
  const next = { paragraphs: [{ section: 0, paragraph: 0 }] };
  attachCheckBoxes(editor, next, true);
  assert.deepEqual(next, content);
  assert.deepEqual(scoped, [0]);
});

test('form-free layouts keep unrelated paragraph data lazy', () => {
  for (const checkBoxes of [[], undefined, null]) {
    let reads = 0;
    const content = { checkBoxes };
    Object.defineProperty(content, 'paragraphs', {
      get() {
        reads++;
        throw Error('UnexpectedParagraphRead');
      },
    });
    const index = inlineCheckBoxIndex(content);
    assert.equal(index.size, 0);
    assert.equal(index.blocked.size, 0);
    assert.deepEqual(index.unavailable, []);
    assert.equal(reads, 0);
  }
});

test('sparse form layouts stop after all first matching paragraph owners are found', () => {
  let visits = 0;
  const paragraphs = Array.from({ length: 4096 }, (_, paragraph) => ({
    get section() {
      visits++;
      return 0;
    },
    paragraph,
    text: '\ufffc',
  }));
  const checkBoxes = [0, 1].map((paragraph) => ({
    section: 0,
    paragraph,
    anchorUnit: 0,
    siteState: 'located',
    formNode: paragraph,
  }));
  const index = inlineCheckBoxIndex({ paragraphs, checkBoxes });
  assert.equal(index.unavailable.length, 2);
  assert(index.unavailable.every((row) => row.reason === 'UnsupportedFormDimensions'));
  assert.equal(visits, 2, 'unrelated trailing paragraphs must stay unread');
});
