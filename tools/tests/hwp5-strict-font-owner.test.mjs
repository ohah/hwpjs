import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { createStrictLayoutFontOwner } from '../../web/preview/strict-layout-font.mjs';
const snapshot = { paragraphs: [{ font: 'Noto Sans KR', bold: false, italic: false }] };
function setup(fail) {
  const fonts = new Set(),
    calls = [];
  const cause = new DOMException('Invalid font data in ArrayBuffer.', 'SyntaxError');
  class Face {
    constructor(family, bytes, descriptors) {
      calls.push({ family, bytes, descriptors });
      this.family = family;
      this.status = 'unloaded';
      if (fail === 'constructor') throw cause;
    }
    async load() {
      if (fail === 'load') throw cause;
      if (typeof fail === 'function') await fail();
      this.status = 'loaded';
      return this;
    }
  }
  const owner = createStrictLayoutFontOwner({
    document: { fonts },
    FontFace: Face,
    crypto: webcrypto,
  });
  const bytes = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 1, 2, 3, 4]).buffer;
  const file = { name: 'owned.otf', size: bytes.byteLength, arrayBuffer: async () => bytes };
  return { owner, fonts, calls, cause, bytes, file };
}
for (const stage of ['constructor', 'load']) {
  test(`font ${stage} rejection keeps cause and exact source profile; no registration/fallback`, async () => {
    const f = setup(stage);
    await assert.rejects(
      f.owner.acquire(snapshot, f.file, () => {}),
      (error) => {
        assert.equal(error.message, 'StrictFontDecodeFailed');
        assert.equal(error.cause, f.cause);
        assert.equal(error.fontProfile.stage, 'font-decode');
        assert.equal(error.fontProfile.byteLength, f.bytes.byteLength);
        assert.equal(error.fontProfile.signatureHex, '4f54544f');
        assert.equal(
          error.fontProfile.sourceSHA256,
          createHash('sha256').update(new Uint8Array(f.bytes)).digest('hex'),
        );
        assert.equal(error.fontProfile.requestedFamily, 'Noto Sans KR');
        assert.equal(error.fontProfile.internalFamilyValidated, false);
        assert.equal(Object.isFrozen(error.fontProfile), true);
        assert.equal('bytes' in error.fontProfile, false);
        return true;
      },
    );
    assert.equal(f.fonts.size, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].bytes, f.bytes);
  });
}
test('successful existing FontFace ownership reuses exact bytes and cleans only its face', async () => {
  const f = setup();
  const owned = await f.owner.acquire(snapshot, f.file, () => {});
  assert.equal(owned.face.status, 'loaded');
  assert.equal(f.calls[0].bytes, f.bytes);
  assert.equal(f.calls[0].family, 'Noto Sans KR');
  assert.equal(await f.owner.acquire(snapshot, f.file, () => {}), owned);
  const other = {};
  f.fonts.add(other);
  f.owner.clear();
  assert.deepEqual([...f.fonts], [other]);
});
test('source length and admission failures keep original errors before decoding', async () => {
  const f = setup();
  await assert.rejects(
    f.owner.acquire(snapshot, { ...f.file, size: 9 }, () => {}),
    /StrictFontFileChanged/,
  );
  await assert.rejects(
    f.owner.acquire(snapshot, f.file, () => {
      throw Error('owner-expired');
    }),
    /owner-expired/,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.fonts.size, 0);
});

for (const kind of ['abort', 'document-replacement']) {
  test(`late rejected load preserves ${kind} classification before decode wrapping`, async () => {
    let rejectLoad;
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const f = setup(
      () =>
        new Promise((_resolve, reject) => {
          rejectLoad = reject;
          entered();
        }),
    );
    let expired;
    const pending = f.owner.acquire(snapshot, f.file, () => {
      if (expired) throw expired;
    });
    await started;
    expired =
      kind === 'abort'
        ? new DOMException('cancelled', 'AbortError')
        : Error('StrictLayoutMeasurementExpired');
    rejectLoad(f.cause);
    await assert.rejects(pending, (error) => {
      assert.equal(error, expired);
      assert.equal('fontProfile' in error, false);
      assert.notEqual(error.message, 'StrictFontDecodeFailed');
      return true;
    });
    assert.equal(f.calls.length, 1);
    assert.equal(f.fonts.size, 0);
  });
}
