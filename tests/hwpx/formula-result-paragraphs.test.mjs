import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFormulaResultParagraphs } from '../../js/formula-result-paragraphs.mjs';
import { createFormulaResultParagraphFilter } from '../../web/preview/formula-result-paragraph-filter.mjs';
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
test('formula result paragraph decoder requires canonical positive uint32 identities', () => {
  assert.deepEqual(decodeFormulaResultParagraphs(encode([1, 2, 0xffffffff])), [1, 2, 0xffffffff]);
  assert.deepEqual(decodeFormulaResultParagraphs(encode([])), []);
  for (const value of [
    null,
    {},
    [0],
    [-1],
    [1, 1],
    [2, 1],
    [1.5],
    [0x100000000],
    ['1'],
    [true],
    [null],
  ]) {
    assert.throws(
      () => decodeFormulaResultParagraphs(encode(value)),
      /InvalidFormulaResultParagraphs/,
    );
  }
  assert.throws(() => decodeFormulaResultParagraphs(Uint8Array.of(0xff)));
});
test('candidate filtering is lazy and request-scoped and preserves native errors', () => {
  let reads = 0;
  const editor = {
    manualFormulaResultParagraphs(section) {
      reads++;
      return section === 2 ? [3008, 3011] : [];
    },
  };
  const names = new Set(['hwpx_edit_manual_formula_result_paragraphs']);
  const filter = createFormulaResultParagraphFilter(editor, names);
  assert.equal(reads, 0);
  assert.equal(filter(2, 3007), false);
  assert.equal(filter(2, 3008), true);
  assert.equal(filter(2, 3011), true);
  assert.equal(reads, 1);
  assert.equal(filter(0, 1), false);
  assert.equal(reads, 2);
  assert.equal(createFormulaResultParagraphFilter(editor, names)(2, 3008), true);
  assert.equal(reads, 3);
  const fail = createFormulaResultParagraphFilter(
    {
      manualFormulaResultParagraphs() {
        throw new Error('InvalidFieldLinks');
      },
    },
    names,
  );
  assert.throws(() => fail(0, 1), /InvalidFieldLinks/);
});
test('old ABI does not filter candidates using guessed or missing results', () => {
  const editor = {
    manualFormulaResultParagraphs() {
      throw new Error('must not call');
    },
  };
  assert.equal(createFormulaResultParagraphFilter(editor, new Set())(2, 3007), true);
  assert.equal(
    createFormulaResultParagraphFilter({}, new Set(['hwpx_edit_manual_formula_result_paragraphs']))(
      2,
      3007,
    ),
    true,
  );
});
