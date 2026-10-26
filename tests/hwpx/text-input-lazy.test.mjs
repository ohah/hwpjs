import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  graphemeUnits,
  snapUnit,
  textChange,
  wordBoundary,
} from '../../web/preview/text-input.mjs';

const moduleURL = new URL('../../web/preview/text-input.mjs', import.meta.url).href;
function child(source) {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    ${source}
  `,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
const load = `const input = await import(${JSON.stringify(moduleURL)});`;
const basicReplacement = `assert.deepEqual(input.textChange('가나다', '가라다'),
  {startUnit: 1, endUnit: 2, text: '라'});`;
const unavailable = `assert.throws(() => input.graphemeUnits('한글'), /IntlSegmenterUnavailable/);
  assert.throws(() => input.wordBoundary('한글 문서', 0, true), /IntlSegmenterUnavailable/);
  assert.throws(() => input.snapUnit('한글', 1), /IntlSegmenterUnavailable/);`;

test('fresh import without Intl preserves scalar replacement and explicitly rejects segmentation', () => {
  // Capability removal is confined to the child, not a fake segmentation implementation.
  child(`delete globalThis.Intl; ${load} ${basicReplacement} ${unavailable}`);
});

test('fresh import with real Intl but without Segmenter has the same explicit boundary', () => {
  child(`delete Intl.Segmenter; assert.equal(typeof Intl, 'object');
    ${load} ${basicReplacement} ${unavailable}`);
});

test('real Intl oracle preserves Korean composition, combining marks, ZWJ and surrogate boundaries', () => {
  const oracle = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  for (const text of ['각한글', 'Ae\u0301B', 'A👨‍👩‍👧‍👦B', 'A😀B', '한글, 문서! 다음']) {
    const bounds = [...oracle.segment(text)].map((part) => part.index).concat(text.length);
    assert.deepEqual(graphemeUnits(text), bounds);
    for (let unit = 0; unit <= text.length; unit++) {
      assert.equal(snapUnit(text, unit), bounds.filter((bound) => bound <= unit).at(-1));
      assert.equal(
        snapUnit(text, unit, true),
        bounds.find((bound) => bound >= unit),
      );
    }
  }
  assert.deepEqual(
    textChange('가', '각', { startUnit: 0, endUnit: 1, inputType: 'insertCompositionText' }),
    { startUnit: 0, endUnit: 1, text: '각' },
  );
  assert.deepEqual(
    textChange('A😀B', 'AB', { startUnit: 3, endUnit: 3, inputType: 'deleteContentBackward' }),
    { startUnit: 1, endUnit: 3, text: '' },
  );
  assert.equal(wordBoundary('한글, 문서! 다음', 0, true), 4);
  assert.equal(wordBoundary('한글, 문서! 다음', 8, false), 4);
});

test('initialized grapheme and word caches reuse real instances without another global lookup', () => {
  child(`${load}
    const graphemes = input.graphemeUnits('Ae\u0301😀');
    const word = input.wordBoundary('한글 문서', 0, true);
    delete globalThis.Intl;
    assert.deepEqual(input.graphemeUnits('Ae\u0301😀'), graphemes);
    assert.equal(input.wordBoundary('한글 문서', 0, true), word);
    ${basicReplacement}`);
});

test('failed initialization can recover when the original real Segmenter capability returns', () => {
  child(`const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Intl');
    const realIntl = globalThis.Intl;
    const expected = [...new realIntl.Segmenter('ko', {granularity: 'grapheme'}).segment('각👨‍👩‍👧‍👦')]
      .map(part => part.index).concat('각👨‍👩‍👧‍👦'.length);
    delete globalThis.Intl; ${load} ${unavailable}
    Object.defineProperty(globalThis, 'Intl', descriptor);
    assert.deepEqual(input.graphemeUnits('각👨‍👩‍👧‍👦'), expected);
    assert.equal(input.wordBoundary('한글 문서', 0, true), 3);
    ${basicReplacement}`);
});
