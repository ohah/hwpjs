import assert from 'node:assert/strict';
import * as core from '@hwpjs/core';
import { verifyShapeCopyTestInputs } from '../../../tools/shape-copy-test-inputs.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const required = (name) => {
  const v = process.env[name];
  assert(v && isAbsolute(v), name + ' must be an explicit absolute path');
  return v;
};
const inputs = JSON.parse(await readFile(required('HWPJS_SHAPE_COPY_INPUTS'), 'utf8'));
const output = required('HWPJS_SHAPE_COPY_OUTPUT');
const sha = (b) => createHash('sha256').update(b).digest('hex');
// Explicit future engines are accepted only through the normal SDK manifest,
// source ledger and actual artifact hashes; no historical engine allowlist.
export async function verifyInputs() {
  await verifyShapeCopyTestInputs(inputs);
}
await verifyInputs();
const publicCore = await import(pathToFileURL(inputs.coreIndex));
assert.equal(
  core.createEditor,
  publicCore.createEditor,
  'source/UI and actual public SDK must share the identical Core module',
);
const runtime = await import(pathToFileURL(inputs.runtimeIndex));
const wasm = await readFile(inputs.NativePath);
assert.equal(sha(wasm), inputs.NativeSHA256);
// Existing WASM instantiation only. No Native source compilation or runtime hook.
export const wasmModule = await WebAssembly.compile(wasm);
export const {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} = core;
export const { createReaderRuntimeFactory } = runtime;
export const NativeSHA256 = inputs.NativeSHA256;
export { sha, output };
export async function inputBytes(format) {
  const b = await readFile(inputs.fixtures[format]);
  assert.equal(
    sha(b),
    format === 'hwp5'
      ? 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f'
      : '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
  );
  return b;
}
export async function caseDirectory(name) {
  assert(/^[a-z0-9-]+$/.test(name));
  const dir = join(output, name);
  await mkdir(dir, { recursive: true });
  return pathToFileURL(dir + '/');
}
