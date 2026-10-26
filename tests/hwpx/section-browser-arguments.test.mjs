import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyHwpxSourceTextRoundtrip } from '../../tools/browser/hwpx-source-text-roundtrip.mjs';

test('source section guards fail before any browser interaction', () => {
  const driver = new Proxy(
    {},
    {
      get() {
        throw new Error('BrowserMustNotBeTouched');
      },
    },
  );
  for (const section of [-1, NaN, Infinity, 0.5, '1', 0x100000000])
    assert.throws(
      () => verifyHwpxSourceTextRoundtrip(driver, null, null, { host: 'body', section }),
      /InvalidSourceTargetSection/,
    );
  assert.throws(() => verifyHwpxSourceTextRoundtrip(driver, null, null, { host: 'unknown' }), {
    name: 'AssertionError',
  });
});
