import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEditor,
  createParagraphSelection,
  SPLICE_TEXT_COMMAND,
} from '../../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../../packages/core/src/runtime.ts';
export { createEditor, createParagraphSelection, SPLICE_TEXT_COMMAND, createReaderRuntimeFactory };
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export function guardedRead(path: string) {
  if (
    ['title-column-roundtrip', 'hwpers_test4_complex_table', 'legacy/hwpers'].some((x) =>
      path.toLowerCase().includes(x),
    ) ||
    path.split('/').includes('..')
  )
    throw Error('ProtectedBeforeAccess');
  return readFileSync(path);
}
const path = process.env.HWPJS_TEST_WASM;
if (!path || !isAbsolute(path)) throw Error('ExplicitWasmRequired');
export const wasmBytes = guardedRead(path);
assert.equal(sha(wasmBytes), 'd849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb');
export const wasmModule = await WebAssembly.compile(wasmBytes);
const fixturePath =
  process.env.HWPJS_TEST_NOTE_FIXTURE ??
  fileURLToPath(
    new URL(
      'legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp',
      new URL('../../../', import.meta.url),
    ),
  );
if (
  !isAbsolute(fixturePath) ||
  !fixturePath.endsWith('/legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp')
)
  throw Error('ExplicitOriginalFootnoteFixtureRequired');
export const original = guardedRead(fixturePath);
assert.equal(sha(original), '360c6dc2c679e03e48396b11d7f31823a577d64e96a9ec75e074390385b865a9');
export const make = () =>
  createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
export async function open() {
  const editor = make();
  await editor.load(new Uint8Array(original), { format: 'hwp5', editable: true });
  return editor;
}
export const find = (editor: any, p = 1) =>
  editor.getEditorState().content.paragraphs.find((r: any) => r.section === 0 && r.paragraph === p);
