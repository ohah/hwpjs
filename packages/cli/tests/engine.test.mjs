import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDocument, edit, read } from '../src/engine.mjs';
import { findUniqueLiteral, validateLiteral } from '../src/literal-match.mjs';

test('literal search rejects overlap and prefix ambiguities, preserving exact UTF16 offsets', () => {
  assert.throws(() => findUniqueLiteral('aaa', 'aa'), /Ambiguous/);
  assert.throws(() => findUniqueLiteral('ababab', 'abab'), /Ambiguous/);
  assert.throws(() => findUniqueLiteral('aaaaabaaaaab', 'aaaab'), /Ambiguous/);
  assert.equal(findUniqueLiteral('🙂앞 ABC 뒤', 'ABC'), 4);
  assert.equal(findUniqueLiteral('🙂🙂X🙂', 'X🙂'), 4);
  assert.equal(findUniqueLiteral('a'.repeat(100_000) + 'b', 'a'.repeat(50_000) + 'b'), 50_000);
  assert.throws(() => findUniqueLiteral('a'.repeat(100_000), 'a'.repeat(50_000) + 'b'), /NotFound/);
  assert.throws(() => findUniqueLiteral('abc', ''), /EmptySearch/);
  assert.throws(() => findUniqueLiteral('abc', 'ABC'), /NotFound/);
});

test('single paragraph policy permits deletion and rejects invalid Unicode/control boundaries', () => {
  assert.equal(validateLiteral('', { empty: true }), '');
  assert.equal(validateLiteral('🙂한글'), '🙂한글');
  for (const value of ['\r', '\n', '\t', '\0', '\u0085', '\u2028', '\u2029'])
    assert.throws(() => validateLiteral('a' + value + 'b'), /SingleParagraph/);
  assert.throws(() => validateLiteral('\ud800'), /InvalidLiteral/);
  assert.throws(() => findUniqueLiteral('\udfff', 'a'), /InvalidNativeText/);
  assert.throws(() => validateLiteral('a'.repeat(4 * 1024 * 1024 + 1)), /Limit/);
});

test('open validates bounded byte inputs and original snapshot SHA before opening Native', async () => {
  const bytes = Uint8Array.of(0x50, 0x4b, 3, 4);
  await assert.rejects(openDocument({ bytes: new ArrayBuffer(4), wasm: bytes }), /Uint8Array/);
  await assert.rejects(openDocument({ bytes: new Uint8Array(), wasm: bytes }), /Limit/);
  await assert.rejects(openDocument({ bytes, wasm: bytes, expectedSha256: 'X' }), /ExpectedSha/);
  await assert.rejects(
    openDocument({ bytes, wasm: bytes, expectedSha256: '0'.repeat(64) }),
    /Mismatch/,
  );
  await assert.rejects(openDocument({ bytes, wasm: new ArrayBuffer(4) }), /WasmUint8Array/);
});

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pins = {
  wasm: '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc',
  hwp5: 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
  hwpx: '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
};
function pinnedInputs(format) {
  const wasmPath = process.env.HWPJS_TEST_WASM;
  assert.ok(
    wasmPath && wasmPath.startsWith('/') && !/hwpers|title-column-roundtrip/i.test(wasmPath),
  );
  assert.equal(process.env.HWPJS_TEST_WASM_SHA256, pins.wasm);
  const inputPath = process.env[format === 'hwp5' ? 'HWPJS_TEST_NOORI' : 'HWPJS_TEST_NOORI_HWPX'];
  const name = format === 'hwp5' ? 'noori.hwp' : 'noori.hwpx';
  assert.ok(
    ['apps/docs/docs/public/editor/fixtures', 'legacy/rust/crates/hwp-core/tests/fixtures']
      .map((dir) => resolve(dir, name))
      .includes(inputPath),
    'explicit named fixture only',
  );
  const wasm = readFileSync(wasmPath),
    bytes = readFileSync(inputPath);
  assert.equal(hash(wasm), pins.wasm);
  assert.equal(hash(bytes), pins[format]);
  return { wasm, bytes };
}
function current(document, target) {
  return document.format === 'hwp5'
    ? document.sdk.text(target.section, target.paragraph)
    : document.sdk.anchorText(target.section, target.paragraph);
}
function editable(document) {
  for (let section = 0; section < document.sectionCount; section++) {
    const paragraphs =
      document.format === 'hwp5'
        ? Array.from({ length: Math.min(document.sdk.paragraphCount(section), 200) }, (_, p) => p)
        : document.sdk
            .paragraphTextSnapshot(section)
            .slice(0, 200)
            .map((row) => row.paragraph);
    for (const paragraph of paragraphs) {
      if (document.format === 'hwpx' && !document.sdk.canEdit(section, paragraph)) continue;
      const target = { section, paragraph };
      const text = current(document, target);
      const literal = document.format === 'hwp5' ? text.replace(/\r$/, '') : text;
      // eslint-disable-next-line no-control-regex -- Fixture selection excludes native control tokens.
      if (literal && literal.length < 10_000 && !/[\u0000-\u001f\u0085\u2028\u2029]/u.test(literal))
        return { target, text, literal };
    }
  }
  assert.fail('Pinned document must have an editable plain literal');
}

for (const format of ['hwp5', 'hwpx']) {
  test(
    `actual Native820 ${format}: current coordinates, save/reopen, ambiguity, deletion and SHA`,
    { skip: process.env.HWPJS_CLI_NATIVE !== '1', timeout: 25_000 },
    async (t) => {
      const input = pinnedInputs(format);
      const document = await openDocument({ ...input, expectedSha256: pins[format] });
      let selected;
      try {
        assert.equal(document.format, format);
        assert.equal(document.sourceSha256, pins[format]);
        selected = editable(document);
        const { target, literal, text } = selected;
        assert.throws(
          () =>
            document.replaceText({
              target: { section: document.sectionCount, paragraph: 0 },
              oldText: literal,
              newText: 'x',
            }),
          /Target/,
        );
        assert.throws(
          () => document.replaceText({ target, oldText: literal, newText: '\n' }),
          /SingleParagraph/,
        );
        assert.equal(current(document, target), text);
        document.replaceText({ target, oldText: literal, newText: 'CLI🙂CLI🙂' });
        assert.throws(
          () => document.replaceText({ target, oldText: 'CLI🙂', newText: 'x' }),
          /Ambiguous/,
        );
        assert.equal(current(document, target), text.replace(literal, 'CLI🙂CLI🙂'));
        const saved = document.save({ allowStaleLayout: true });
        const reopened = await openDocument({
          bytes: format === 'hwp5' ? saved.bytes : saved,
          wasm: input.wasm,
        });
        try {
          assert.equal(current(reopened, target), text.replace(literal, 'CLI🙂CLI🙂'));
        } finally {
          reopened.close();
        }
        document.replaceText({ target, oldText: 'CLI🙂CLI🙂', newText: '' });
        assert.equal(current(document, target), text.replace(literal, ''));
        document.close();
        document.close();
        assert.throws(() => document.save(), /Closed/);
      } finally {
        document.close();
      }
      const result = await edit({
        ...input,
        target: selected.target,
        replace: selected.literal,
        with: 'CLI🙂',
        allowStaleLayout: true,
      });
      assert.equal(result.format, format);
      assert.equal(result.changed, true);
      assert.ok(result.bytes instanceof Uint8Array);
      assert.equal(typeof result.layoutRequiresReflow, 'boolean');
      if (format === 'hwp5') assert.equal(result.layoutRequiresReflow, true);
      else assert.equal(result.layoutRequiresReflow, false);
      if (format === 'hwp5')
        await assert.rejects(
          edit({ ...input, target: selected.target, replace: selected.literal, with: 'CLI🙂' }),
          /[Rr]eflow|[Ll]ayout/,
        );
      const final = await openDocument({ bytes: result.bytes, wasm: input.wasm });
      try {
        assert.equal(
          current(final, selected.target),
          selected.text.replace(selected.literal, 'CLI🙂'),
        );
      } finally {
        final.close();
      }
      const observed = await read(input);
      assert.equal(observed.format, format);
      assert.equal(observed.model.sourceSha256, pins[format]);
      const paragraphs = [];
      const stack = [observed.model];
      const seen = new Set();
      while (stack.length) {
        const value = stack.pop();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        assert.ok(seen.size < 500_000, 'bounded detached model');
        if (value.type === 'paragraph') paragraphs.push(value);
        for (const child of Object.values(value))
          if (child && typeof child === 'object') stack.push(child);
      }
      const id = `s${selected.target.section}:p${selected.target.paragraph}`;
      const matches = paragraphs.filter((paragraph) => paragraph.id === id);
      assert.equal(matches.length, 1, 'exactly one native edit identity in model');
      assert.equal(Object.hasOwn(matches[0], 'text'), false, 'read model has no raw native text');
      assert.ok(matches[0].displayText === null || typeof matches[0].displayText === 'string');
      assert.equal(matches[0].source.section, selected.target.section);
      assert.equal(matches[0].source.paragraph, selected.target.paragraph);
      t.diagnostic(
        JSON.stringify({
          format,
          nativeSha256: pins.wasm,
          sourceSha256: pins[format],
          target: selected.target,
        }),
      );
    },
  );
}
