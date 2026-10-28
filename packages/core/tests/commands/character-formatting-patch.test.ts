import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFormattingPatch,
  formattingPatchNeedsCharacter,
} from '../../src/commands/atomic-formatting.ts';
import { validateCharacterFormattingPatch } from '../../src/commands/character-formatting-patch.ts';
const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
test('전체 글자 intent는 단일 patch에서 언어별 sparse 값을 보존한다', () => {
  const character = {
    size: 1200,
    bold: false,
    italic: true,
    textColor: 0x123456,
    fonts: { hangul: { name: '맑은 고딕' }, latin: { id: 0 } },
    ratio: { hangul: 50, latin: 200 },
    charSpacing: { hangul: -50 },
    relativeSize: { latin: 250 },
    offset: { hangul: -100 },
    underline: { kind: 'bottom', style: 'DOT', color: 0 },
    strike: { enabled: false, style: 'SOLID' },
    shade: { kind: 'none' },
    outlineKind: 'dash_dot',
    effects: { script: 'superscript' },
    shadow: { kind: 'none' },
  };
  const before = JSON.stringify(character);
  validateFormattingPatch({ character });
  assert.equal(JSON.stringify(character), before);
  assert.equal(formattingPatchNeedsCharacter({ character } as any), true);
});
for (const [key, lo, hi] of [
  ['ratio', 50, 200],
  ['charSpacing', -50, 50],
  ['relativeSize', 10, 250],
  ['offset', -100, 100],
] as const)
  test('일곱 언어의 범위와 부재 보존 ' + key, () => {
    for (const lang of languages) {
      validateCharacterFormattingPatch({ [key]: { [lang]: lo } });
      validateCharacterFormattingPatch({ [key]: { [lang]: hi } });
      assert.throws(() => validateCharacterFormattingPatch({ [key]: { [lang]: lo - 1 } }));
      assert.throws(() => validateCharacterFormattingPatch({ [key]: { [lang]: hi + 1 } }));
    }
  });
test('빈 글자 map과 false/0 의도를 구분한다', () => {
  for (const character of [{}, { ratio: {} }, { underline: {} }, { fonts: {} }]) {
    validateFormattingPatch({ character });
    assert.equal(formattingPatchNeedsCharacter({ character }), false);
  }
  for (const character of [{ bold: false }, { textColor: 0 }, { strike: { enabled: false } }])
    assert.equal(formattingPatchNeedsCharacter({ character }), true);
  validateFormattingPatch({ paragraph: {} });
  assert.throws(() => validateFormattingPatch({}));
});
test('reset은 명시 basis/scope만 받고 쓰기와 혼합하지 않는다', () => {
  for (const scope of ['character', 'paragraph', 'all'])
    validateFormattingPatch({ reset: { basis: 'paragraph-style', scope } });
  assert.equal(
    formattingPatchNeedsCharacter({ reset: { basis: 'paragraph-style', scope: 'paragraph' } }),
    false,
  );
  assert.throws(() => validateFormattingPatch({ reset: 'all' }));
  assert.throws(() =>
    validateFormattingPatch({
      reset: { basis: 'paragraph-style', scope: 'all' },
      character: { bold: false },
    }),
  );
});
for (const character of [
  { shade: { kind: 'none', style: 'SOLID' } },
  { underline: { enabled: true } },
  { strike: { kind: 'bottom' } },
  { shadow: { style: 'DOT' } },
  { fonts: { hangul: { id: 0, name: 'A' } } },
  { textColor: 0xffffffff },
  { ratio: { english: 100 } },
  { effects: { script: 'none' } },
])
  test('다른 분기의 키와 잘못된 값 거부 ' + JSON.stringify(character), () =>
    assert.throws(() => validateFormattingPatch({ character })),
  );
test('접근자와 알 수 없는 필드로 값이나 권위를 만들지 않는다', () => {
  let reads = 0;
  const c = Object.defineProperty({}, 'bold', {
    get() {
      reads++;
      return true;
    },
    enumerable: true,
  });
  assert.throws(() => validateCharacterFormattingPatch(c));
  assert.equal(reads, 0);
  assert.throws(() => validateCharacterFormattingPatch({ unknown: 1 }));
});
