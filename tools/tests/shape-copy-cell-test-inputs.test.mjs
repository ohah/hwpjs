// Metadata gates only. No WASM instantiation, SDK substitution, or Native claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  oracleInputs,
  verifyCellOwnerInputs,
  verifyCellFixtureInputs,
} from '../shape-copy-cell-input-validation.mjs';
test('portable strict oracle has the exact frozen entry and all 20 dependencies', async () => {
  const value = await oracleInputs();
  assert.equal(value.files.length, 20);
  assert.equal(
    value.strictPreimage.sha256,
    '430fe92bed0b9151dbfbc41c0e7db2dffa2c195b87930396d43ea45e1deaed73',
  );
  await verifyCellOwnerInputs(value);
});
test('portable oracle rejects substituted entry even with the same claimed hash', async () => {
  const value = structuredClone(await oracleInputs());
  value.strictPreimage.path += '.foreign';
  await assert.rejects(verifyCellOwnerInputs(value), /CellStrictOracleBindingMismatch/);
});
test('portable oracle rejects a removed dependency without importing candidate code', async () => {
  const value = structuredClone(await oracleInputs());
  value.files.pop();
  await assert.rejects(verifyCellOwnerInputs(value), /CellStrictOracleBindingMismatch/);
});
test('missing fixture schema or environment fails instead of skipping', async () => {
  await assert.rejects(verifyCellFixtureInputs({ schemaVersion: 1 }));
  const old = process.env.HWPJS_SHAPE_COPY_INPUTS;
  delete process.env.HWPJS_SHAPE_COPY_INPUTS;
  try {
    await assert.rejects(verifyCellFixtureInputs({ schemaVersion: 2 }));
  } finally {
    if (old !== undefined) process.env.HWPJS_SHAPE_COPY_INPUTS = old;
  }
});
