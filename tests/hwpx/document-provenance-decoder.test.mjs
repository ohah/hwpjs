import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeDocumentProvenance,
  isSourceColorProfile,
} from '../../js/hwpx-document-provenance.mjs';

const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
function packet() {
  return {
    sourceOnly: true,
    sourceVersion: {
      major: 5,
      minor: 1,
      micro: 0,
      build_number: 1,
      patch: null,
      revision: null,
      os: 1,
      xml_version: '1.2',
      target_application: 'WORDPROCESSOR',
      application: 'Hancom Office Hangul',
      app_version: '10, 0, 0, 5060 WIN32LEWindows_8',
      xml_bytes: 300,
    },
    sourceVersionError: null,
    sourceColorProfile: { id: 'opaque-native-profile', encoding: 'colorref24', verified: true },
  };
}
const modified = (change) => {
  const value = packet();
  change(value);
  return value;
};
const cases = [
  ['exact raw DTO', () => packet(), true],
  [
    'opaque future profile is not classified by JS',
    () =>
      modified(
        (v) =>
          (v.sourceColorProfile = { id: 'future-native-id', encoding: 'rgb24', verified: false }),
      ),
    true,
  ],
  [
    'missing version with explicit diagnostic',
    () =>
      modified((v) => {
        v.sourceVersion = null;
        v.sourceVersionError = 'MissingVersionXml';
      }),
    true,
  ],
  ['null optional version and error', () => modified((v) => (v.sourceVersion = null)), true],
  ['extra root key', () => modified((v) => (v.guess = 'not allowed')), false],
  ['false sourceOnly', () => modified((v) => (v.sourceOnly = false)), false],
  ['missing raw version key', () => modified((v) => delete v.sourceVersion.micro), false],
  ['negative raw major', () => modified((v) => (v.sourceVersion.major = -1)), false],
  ['overflow xml byte count', () => modified((v) => (v.sourceVersion.xml_bytes = 2 ** 32)), false],
  [
    'unsupported profile encoding',
    () => modified((v) => (v.sourceColorProfile.encoding = 'argb32')),
    false,
  ],
  ['numeric verified', () => modified((v) => (v.sourceColorProfile.verified = 1)), false],
  [
    'version and error conflict',
    () => modified((v) => (v.sourceVersionError = 'InvalidVersion')),
    false,
  ],
  ['array profile', () => modified((v) => (v.sourceColorProfile = [])), false],
  ['extra profile key', () => modified((v) => (v.sourceColorProfile.raw = 0)), false],
  [
    'oversized version text',
    () => modified((v) => (v.sourceVersion.app_version = 'x'.repeat(4097))),
    false,
  ],
  ['invalid UTF8', () => new Uint8Array([0xc0, 0x80]), false],
  ['transport above 1MiB', () => new Uint8Array(1024 * 1024 + 1), false],
];
assert.equal(cases.length, 17);
for (const [name, make, accepted] of cases)
  test(`document provenance strict DTO: ${name}`, () => {
    const value = make(),
      input = value instanceof Uint8Array ? value : encode(value);
    if (accepted) {
      assert.deepEqual(decodeDocumentProvenance(input), value);
    } else
      assert.throws(() => decodeDocumentProvenance(input), /^Error: InvalidDocumentProvenance$/);
  });

test('transport exact 1MiB boundary and null/missing field distinction remain explicit', () => {
  const raw = encode(packet()),
    padded = new Uint8Array(1024 * 1024);
  padded.fill(32);
  padded.set(raw);
  assert.deepEqual(decodeDocumentProvenance(padded), packet());
  const missing = packet();
  delete missing.sourceVersion;
  assert.throws(() => decodeDocumentProvenance(encode(missing)), /InvalidDocumentProvenance/);
  const optional = packet();
  optional.sourceVersion.micro = null;
  assert.equal(decodeDocumentProvenance(encode(optional)).sourceVersion.micro, null);
  const original = encode(packet()),
    decoded = decodeDocumentProvenance(original);
  decoded.sourceVersion.application = 'changed copy';
  assert.equal(
    decodeDocumentProvenance(original).sourceVersion.application,
    'Hancom Office Hangul',
  );
});

test('profile validator checks DTO shape without inferring producer policy', () => {
  assert.equal(
    isSourceColorProfile({ id: 'not-a-known-producer', encoding: 'colorref24', verified: false }),
    true,
  );
  for (const value of [
    null,
    [],
    {},
    { id: '', encoding: 'rgb24', verified: false },
    { id: 'x'.repeat(257), encoding: 'rgb24', verified: false },
    { id: 'x', encoding: 'bgr', verified: false },
    { id: 'x', encoding: 'rgb24', verified: 0 },
  ])
    assert.equal(isSourceColorProfile(value), false);
});
