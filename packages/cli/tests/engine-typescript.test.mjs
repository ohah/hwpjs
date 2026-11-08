import test from 'node:test';
import assert from 'node:assert/strict';
import { openDocument } from '../src/engine.ts';
import { findUniqueLiteral, validateLiteral } from '../src/literal-match.ts';

test('TS 일반 치환은 UTF16 위치와 겹치는 모호성 정책을 보존한다', () => {
  assert.equal(findUniqueLiteral('🙂앞 ABC 뒤', 'ABC'), 4);
  assert.equal(findUniqueLiteral('a'.repeat(100000) + 'b', 'a'.repeat(50000) + 'b'), 50000);
  for (const [text, literal] of [
    ['aaa', 'aa'],
    ['ababab', 'abab'],
  ])
    assert.throws(() => findUniqueLiteral(text, literal), /AmbiguousLiteralText/);
  assert.throws(() => findUniqueLiteral('abc', 'ABC'), /LiteralTextNotFound/);
});

test('TS 일반 치환은 삭제와 올바른 Unicode를 허용하고 제어문자를 거부한다', () => {
  assert.equal(validateLiteral('', { empty: true }), '');
  assert.equal(validateLiteral('🙂한글'), '🙂한글');
  for (const value of ['\r', '\n', '\t', '\0', '\u0085', '\u2028', '\u2029'])
    assert.throws(() => validateLiteral('가' + value), /SingleParagraphTextRequired/);
  assert.throws(() => validateLiteral('\ud800'), /InvalidLiteralText/);
  assert.throws(() => findUniqueLiteral('\udfff', '가'), /InvalidNativeText/);
});

test('TS 열기는 Native 진입 전에 입력 예산과 SHA 및 WASM 바이트를 검증한다', async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4]);
  await assert.rejects(
    openDocument({ bytes: new ArrayBuffer(4), wasm: bytes }),
    /ExpectedDocumentUint8Array/,
  );
  await assert.rejects(
    openDocument({ bytes: new Uint8Array(), wasm: bytes }),
    /DocumentLimitExceeded/,
  );
  await assert.rejects(
    openDocument({ bytes, wasm: null, expectedSha256: 'X' }),
    /InvalidExpectedSha256/,
  );
  await assert.rejects(
    openDocument({ bytes, wasm: null, expectedSha256: '0'.repeat(64) }),
    /ExpectedWasmUint8Array/,
  );
  await assert.rejects(
    openDocument({ bytes, wasm: bytes, expectedSha256: '0'.repeat(64) }),
    /SourceSha256Mismatch/,
  );
});

test('TS 열기는 알려진 독립 SHA 벡터 확인 후 원문 형식을 거부한다', async () => {
  await assert.rejects(
    openDocument({
      bytes: Uint8Array.of(97, 98, 99),
      wasm: Uint8Array.of(1),
      expectedSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    }),
    /UnsupportedDocumentSignature/,
  );
});
