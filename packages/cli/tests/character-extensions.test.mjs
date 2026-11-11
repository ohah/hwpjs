import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDocumentOperations } from '../src/document-operations.ts';
const sha = 'a'.repeat(64),
  unknown = { state: 'unknown', writable: false, reason: 'UnknownSourceColor', raw: 4294967295 };
const unavailable = { state: 'unavailable', writable: false, reason: 'MissingFontReference' };
const op = {
  kind: 'character-properties',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 1,
  startUnit: 0,
  endUnit: 1,
  expectedRangeText: 'A',
  properties: { textColor: '#123456', fontName: { language: 'latin', name: 'Font' } },
};
function fixture(outcome = { nativeCode: 2, application: 'unapplied', changed: false }) {
  const calls = [];
  let enabled = false;
  const fields = () =>
    Object.fromEntries(
      ['character.textColor', 'character.fonts.latin.name'].map((k) => [
        k,
        {
          readable: true,
          writable: enabled,
          reason: enabled ? undefined : 'OwnedHistoryUnavailable',
          ...(k === 'character.textColor' ? { unit: 'RGB24' } : {}),
        },
      ]),
    );
  const observations = structuredClone({
    perTarget: [
      {
        ref: 'issued',
        fields: { 'character.textColor': unknown, 'character.fonts.latin.name': unavailable },
      },
    ],
    aggregate: { 'character.textColor': unknown, 'character.fonts.latin.name': unavailable },
  });
  const sdk = {
    supportsAtomicFormatting: () => true,
    supportsSourceTableCellSplit: () => true,
    enableHistoryV2() {
      calls.push('history');
      enabled = true;
    },
    atomicFormattingCapabilities: () => ({
      schemaVersion: 1,
      atomic: true,
      format: 'hwpx',
      coordinateSpace: 'native-source-utf16',
      requiresHistoryProtocol: 2,
      fields: fields(),
      binding: { session: 'native', revision: 0 },
    }),
    sourceTableCellSplitBinding: () => ({ session: 'scoped-native', revision: 0, serial: '0' }),
    paragraphFlow: () => [{ paragraph: 1, host: 'body', top_level: true, source_node: 1 }],
    anchorText: () => 'AB',
    setCharacterProperties() {
      calls.push('legacy-write');
    },
    queryFormatting: () => ({
      schemaVersion: 1,
      binding: { session: 'native', revision: 0 },
      targets: [{ ref: 'issued', ranges: [{ startUnit: 0, endUnit: 1 }] }],
      observations: structuredClone(observations),
    }),
    applyFormattingPatch() {
      calls.push('atomic-write');
      return outcome;
    },
  };
  const document = {
    format: 'hwpx',
    sourceSha256: sha,
    sectionCount: 1,
    sdk,
    save() {
      calls.push('save');
      return new Uint8Array([2]);
    },
    close() {
      calls.push('close');
    },
  };
  return {
    calls,
    observations,
    document,
    writable() {
      for (const v of Object.values(observations.aggregate)) v.writable = true;
      for (const row of observations.perTarget)
        for (const v of Object.values(row.fields)) v.writable = true;
    },
    apply: (operations) =>
      applyDocumentOperations(
        { bytes: new Uint8Array([1]), wasm: new Uint8Array([1]), expectedSha256: sha, operations },
        { openDocument: async () => document },
      ),
  };
}
test('unknown color and unavailable font observations remain exact on refusal without defaults or writes', async () => {
  const f = fixture();
  await assert.rejects(f.apply([op]), (error) => {
    assert.deepEqual(error.observations, f.observations);
    return true;
  });
  assert.deepEqual(f.calls, ['history', 'close']);
});
test('uncertain completion and cleanup failure never save or retry', async () => {
  for (const result of [
    { nativeCode: 0, application: 'unapplied', changed: false, error: 'Rejected' },
    { nativeCode: 3, application: 'unknown', changed: null },
    { nativeCode: 1, application: 'applied', changed: true, cleanupError: 'Cleanup' },
    { nativeCode: 1, application: 'applied', changed: true, refreshRequired: true },
  ]) {
    const f = fixture(result);
    f.writable();
    await assert.rejects(f.apply([op]));
    assert(!f.calls.includes('save'));
    assert.equal(f.calls.filter((k) => k === 'atomic-write').length, 1);
    assert.equal(f.calls.at(-1), 'close');
  }
});
test('capability refusal and malformed later field admit no history or writes', async () => {
  const f = fixture();
  f.document.sdk.supportsAtomicFormatting = () => false;
  await assert.rejects(f.apply([{ ...op, properties: { bold: true } }, op]), /AbiUnavailable/);
  assert.deepEqual(f.calls, ['close']);
  const g = fixture();
  await assert.rejects(
    g.apply([op, { ...op, properties: { fontName: { language: 'latin', name: '\ud800' } } }]),
  );
  assert.deepEqual(g.calls, []);
});
