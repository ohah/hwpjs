import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createEditor } from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime.ts';
import { EditorState } from '../../src/state/editor-state.ts';
import { getSelectionFormatting } from '../../src/state/formatting-state.ts';
// @ts-ignore Existing canonical display observation helpers.
import { characterSelectionState } from '../../../../web/preview/character-property-selection.mjs';
// @ts-ignore Existing canonical display observation helpers.
import { characterSizeState } from '../../../../web/preview/character-size-selection.mjs';
// @ts-ignore Shared coverage; no duplicated formatter implementation.
import { characterRangeValues } from '../../../../web/preview/character-range-values.mjs';
// @ts-ignore Public scalar policy; web defaults remain unchanged.
import { isUtf16Boundary } from '../../../../web/preview/utf16-boundary.mjs';
const base = () => ({
  characterPropertiesAvailable: true,
  characterUnderlineAvailable: true,
  characterStrikeAvailable: true,
  characterShapes: [{ id: 6, bold: false, italic: true, height: 1600 }],
  characterUnderlines: [{ id: 6, kind: 'none' }],
  characterStrikes: [{ id: 6, enabled: false }],
});
const row = (id: unknown = null) => ({
  section: 0,
  paragraph: 0,
  text: 'ABCD',
  characterRanges: [
    { start: 0, end: 2, charShapeId: 6 },
    { start: 2, end: 4, charShapeId: id },
  ],
});
const scalar = { isBoundary: isUtf16Boundary };
function observe(c: unknown, p: unknown, start: number, end: number) {
  return {
    bold: characterSelectionState(c, p, start, end, 'bold'),
    size: characterSizeState(c, p, start, end, scalar),
  };
}
test('outside NoRef/unknown binding does not erase selected known observations', () => {
  for (const id of [null, undefined, 0.5, -1, 99]) {
    const p = row(id),
      c = { ...base(), paragraphs: [p] };
    assert.deepEqual(observe(c, p, 0, 2), { bold: false, size: 1600 });
    assert.deepEqual(
      characterRangeValues(
        c,
        [{ section: 0, paragraph: 0, startUnit: 0, endUnit: 2 }],
        (shape: number) => (shape === 6 ? 1600 : null),
        scalar,
      ),
      [1600],
    );
  }
});
test('selected absent/invalid binding is unknown, not false or a synthesized value', () => {
  for (const id of [null, undefined, 0.5, -1, 99]) {
    const p = row(id),
      c = { ...base(), paragraphs: [p] };
    assert.deepEqual(observe(c, p, 2, 4), { bold: null, size: null });
    assert.equal(
      characterRangeValues(
        c,
        [{ section: 0, paragraph: 0, startUnit: 2, endUnit: 4 }],
        (shape: number) => (shape === 6 ? 1600 : null),
        scalar,
      ),
      null,
    );
  }
});
test('malformed rows/ranges remain unknown without TypeError', () => {
  for (const characterShapes of [
    {},
    [null],
    [{ bold: false, height: 1600 }],
    [
      { id: 6, bold: false, height: 1600 },
      { id: 6, bold: true, height: 1600 },
    ],
  ])
    assert.deepEqual(observe({ ...base(), characterShapes }, row(), 0, 2), {
      bold: null,
      size: null,
    });
  for (const characterRanges of [
    {},
    [null],
    [{ start: 0, end: 5, charShapeId: 6 }],
    [{ start: NaN, end: 2, charShapeId: 6 }],
  ])
    assert.deepEqual(observe(base(), { ...row(), characterRanges }, 0, 2), {
      bold: null,
      size: null,
    });
  for (const [property, key] of [
    ['underline', 'characterUnderlines'],
    ['strike', 'characterStrikes'],
  ])
    for (const inventory of [{}, [null]])
      assert.equal(
        characterSelectionState({ ...base(), [key]: inventory }, row(), 0, 2, property),
        null,
      );
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  const p = {
    ...row(),
    characterRanges: {},
    selectionOwner: 'section:0:body',
    editable: true,
    currentReference: { kind: 'original', section: 0, id: '0' },
  };
  const selection = {
    ...token,
    format: 'hwp5',
    coordinateSpace: 'display',
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 2,
    affinity: 'forward',
  };
  const state = new EditorState({
    ...token,
    status: 'ready',
    stateVersion: 1,
    selection,
    content: { ...base(), format: 'hwp5', paragraphs: [p] },
  });
  const f = getSelectionFormatting(state);
  assert(f.target);
  assert.equal(f.bold, null);
  assert.equal(f.size, null);
});
test('core scalar and web grapheme policies remain distinct with no new Intl dependency', () => {
  for (const text of ['A\u0301B', '한X']) {
    const p = { ...row(), text, characterRanges: [{ start: 0, end: text.length, charShapeId: 6 }] };
    assert.equal(characterSizeState(base(), p, 0, 1), null);
    assert.equal(characterSizeState(base(), p, 0, 1, scalar), 1600);
  }
  const saved = globalThis.Intl;
  try {
    Reflect.set(globalThis, 'Intl', undefined);
    const p = {
      ...row(),
      text: 'A\u0301',
      characterRanges: [{ start: 0, end: 2, charShapeId: 6 }],
    };
    assert.deepEqual(observe(base(), p, 0, 1), { bold: false, size: 1600 });
    assert.equal(characterSizeState(base(), { ...p, text: '😀' }, 0, 1, scalar), null);
  } finally {
    Reflect.set(globalThis, 'Intl', saved);
  }
});
const fixtures = [
  'legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwp',
  'legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwpx',
];
const wasmPath = process.env.HWPJS_TEST_WASM;
test(
  'explicit b7 actual Native known values agree with scalar display getters in both formats',
  {
    skip: !wasmPath
      ? 'HWPJS_TEST_WASM required'
      : fixtures.some((path) => !existsSync(path))
        ? 'tracked format fixtures unavailable'
        : false,
  },
  async () => {
    const wasm = readFileSync(wasmPath!);
    assert.equal(
      createHash('sha256').update(wasm).digest('hex'),
      'b7aec1c9c674dbbef96c8c88e29a39e675a7eb85da630fe8707e7e2ad230bcee',
      'this control is explicitly frozen b7, not a new Native generation',
    );
    const module = await WebAssembly.compile(wasm);
    for (const [i, format] of (['hwp5', 'hwpx'] as const).entries()) {
      const e = createEditor({
        runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
      });
      try {
        await e.load(new Uint8Array(readFileSync(fixtures[i])), { format, editable: true });
        const content = e.getEditorState().content as any;
        let count = 0;
        for (const p of content.paragraphs)
          for (const span of p.characterRanges ?? []) {
            if (span.start >= span.end) continue;
            const shape = content.characterShapes.find((s: any) => s.id === span.charShapeId);
            assert(shape);
            assert.equal(
              characterSelectionState(content, p, span.start, span.end, 'bold'),
              shape.bold,
            );
            assert.equal(
              characterSelectionState(content, p, span.start, span.end, 'italic'),
              shape.italic,
            );
            assert.equal(
              characterSizeState(content, p, span.start, span.end, scalar),
              shape.height,
            );
            count++;
          }
        assert(count > 0);
      } finally {
        await e.dispose();
      }
    }
  },
);
