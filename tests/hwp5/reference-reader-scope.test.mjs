import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceReaderScope } from '../../tools/reference-reader-scope.mjs';
test('reference reader scope separates HWP3 exclusion from supported containers and unknown signatures', () => {
  assert.deepEqual(
    referenceReaderScope(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
    { format: 'hwp5', inScope: true },
  );
  assert.deepEqual(referenceReaderScope(Uint8Array.of(0x50, 0x4b, 3, 4)), {
    format: 'hwpx',
    inScope: true,
  });
  assert.deepEqual(
    referenceReaderScope(
      new TextEncoder().encode('HWP Document File V3.00 \x1a\x01\x02\x03\x04\x05'),
    ),
    { format: 'hwp3', inScope: false, reason: 'Hwp3OutsideRequestedScope' },
  );
  for (const bytes of [new Uint8Array(), Uint8Array.of(0x50, 0x4b, 3), Uint8Array.of(0xd0, 0xcf)])
    assert.throws(() => referenceReaderScope(bytes), /UnsupportedDocumentSignature/);
  assert.throws(() => referenceReaderScope([]), /ExpectedDocumentBytes/);
});
