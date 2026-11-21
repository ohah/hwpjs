import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceBlankImageFixtures } from './produce-image-insertion-blanks.mjs';
const project = fileURLToPath(new URL('../../', import.meta.url));
test('blank producer refuses source and SDK output paths before importing SDK', async () => {
  await assert.rejects(
    produceBlankImageFixtures({ sdkRoot: project, out: join(project, 'must-not-write') }),
    /PrivateOutputRequired/,
  );
});
test('blank producer keeps an existing output file intact', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'hwpjs-blank-producer-')));
  try {
    const output = join(dir, 'existing');
    await writeFile(output, 'preserved');
    await assert.rejects(
      produceBlankImageFixtures({ sdkRoot: project, out: output }),
      /OutputAlreadyExists/,
    );
    assert.equal(await readFile(output, 'utf8'), 'preserved');
  } finally {
    await rm(dir, { recursive: true });
  }
});
test('blank producer rejects a false qualification before runtime or output creation', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'hwpjs-blank-binding-')));
  try {
    const binding = join(dir, 'binding.json'),
      receipt = join(dir, 'receipt.json'),
      output = join(dir, 'new-output');
    await writeFile(
      binding,
      JSON.stringify({ sourceTree: 'expected', sourceReceiptSHA256: 'wrong' }),
    );
    await writeFile(receipt, JSON.stringify({ tree: 'different', passed: true }));
    await assert.rejects(
      produceBlankImageFixtures({
        sdkRoot: project,
        bindingPath: binding,
        sourceReceipt: receipt,
        out: output,
      }),
      /UnqualifiedSourceReceipt/,
    );
    await assert.rejects(stat(output), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true });
  }
});
