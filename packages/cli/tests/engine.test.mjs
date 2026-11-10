import { nativeArtifactExpectedSHA256 } from './native-artifact-pin.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDocument, edit, read } from '../src/engine.ts';
import { findUniqueLiteral, validateLiteral } from '../src/literal-match.ts';

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
  // Malformed expected SHA is rejected first. Valid expected SHA still requires
  // a WASM snapshot before async hashing, even when its value would mismatch.
  await assert.rejects(openDocument({ bytes, wasm: null, expectedSha256: 'X' }), /ExpectedSha/);
  await assert.rejects(
    openDocument({ bytes, wasm: null, expectedSha256: '0'.repeat(64) }),
    /WasmUint8Array/,
  );
});

test('browser engine/model/render dependency graph imports without Node modules or globals', () => {
  const urls = ['engine.ts', 'literal-match.ts', 'document-model.ts', 'render.ts'].map(
    (name) => new URL('../src/' + name, import.meta.url).href,
  );
  const program = `
    import assert from 'node:assert/strict';
    import {registerHooks} from 'node:module';
    const hostProcess = process;
    const webCrypto = globalThis.crypto;
    registerHooks({resolve(specifier, context, next) {
      if (specifier.startsWith('node:') || (!specifier.startsWith('.') && !specifier.startsWith('file:')))
        throw Error('NonBrowserDependency:' + specifier);
      return next(specifier, context);
    }});
    globalThis.Buffer = undefined;
    globalThis.process = undefined;
    globalThis.require = undefined;
    globalThis.module = undefined;
    globalThis.__dirname = undefined;
    globalThis.__filename = undefined;
    assert.equal(globalThis.crypto, webCrypto);
    const [engine, literal, model, renderer] = await Promise.all(${JSON.stringify(urls)}.map(url => import(url)));
    assert.equal(typeof model.readDocumentModel, 'function');
    assert.equal(typeof renderer.renderDocument, 'function');
    assert.equal(literal.validateLiteral('🙂한글'), '🙂한글');
    assert.equal(literal.findUniqueLiteral('🙂앞 ABC 뒤', 'ABC'), 4);
    assert.throws(() => literal.validateLiteral('\\ud800'), /InvalidLiteral/);
    assert.throws(() => literal.validateLiteral('🙂'.repeat(1024 * 1024 + 1)), /LiteralLimit/);
    // Known independent SHA-256("abc") reaches signature rejection, proving
    // async digest/hex validation without compiling any WASM or opening Native.
    await assert.rejects(engine.openDocument({bytes: Uint8Array.of(97,98,99), wasm: Uint8Array.of(1),
      expectedSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}), /UnsupportedDocumentSignature/);
    hostProcess.stdout.write('browser dependency and WebCrypto vector passed\\n');
  `;
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=128', '--input-type=module', '-e', program],
    { encoding: 'utf8', timeout: 10_000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /WebCrypto vector passed/);
});

test('adversarial exhaustive literal oracle is exact over overlaps and supplementary Unicode', () => {
  const strings = [''];
  let level = [''];
  for (let depth = 1; depth <= 4; depth++) {
    level = level.flatMap((prefix) => ['a', 'b', '🙂'].map((char) => prefix + char));
    strings.push(...level);
  }
  const patterns = strings.filter((value) => value.length > 0 && [...value].length <= 2);
  for (const text of strings)
    for (const pattern of patterns) {
      const offsets = [];
      for (let at = 0; at < text.length; at++)
        if (text.slice(at, at + pattern.length) === pattern) offsets.push(at);
      if (offsets.length === 1) assert.equal(findUniqueLiteral(text, pattern), offsets[0]);
      else
        assert.throws(
          () => findUniqueLiteral(text, pattern),
          offsets.length ? /Ambiguous/ : /NotFound/,
        );
    }
  assert.throws(() => findUniqueLiteral('e\u0301', 'é'), /NotFound/);
  assert.equal(findUniqueLiteral('é e\u0301', 'e\u0301'), 2);
});

test('adversarial null and numeric target errors reject before any async Native open', async () => {
  for (const target of [
    null,
    [],
    {},
    { section: NaN, paragraph: 0 },
    { section: 0, paragraph: Infinity },
    { section: -1, paragraph: 0 },
    { section: 0, paragraph: 0x100000000 },
  ])
    await assert.rejects(
      edit({ bytes: null, wasm: null, target, replace: 'x', with: 'y' }),
      /Target/,
    );
  for (const value of [null, undefined, 1, {}, ['x']])
    assert.throws(() => validateLiteral(value), /InvalidLiteral/);
});

test('adversarial byte and decoded-text bounds reject oversized inputs', async () => {
  await assert.rejects(
    openDocument({ bytes: new Uint8Array(64 * 1024 * 1024 + 1), wasm: null }),
    /DocumentLimit/,
  );
  await assert.rejects(
    openDocument({
      bytes: Uint8Array.of(0x50, 0x4b, 3, 4),
      wasm: new Uint8Array(64 * 1024 * 1024 + 1),
    }),
    /WasmLimit/,
  );
  assert.throws(() => validateLiteral('🙂'.repeat(1024 * 1024 + 1)), /LiteralLimit/);
  assert.throws(() => findUniqueLiteral('x'.repeat(32 * 1024 * 1024 + 1), 'x'), /DecodedTextLimit/);
});

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pins = {
  wasm: nativeArtifactExpectedSHA256(),
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
    `actual Native ${format}: input/output ownership, no-op history and failed-edit atomicity`,
    { skip: process.env.HWPJS_CLI_NATIVE !== '1', timeout: 25_000 },
    async () => {
      const input = pinnedInputs(format);
      const bytes = Uint8Array.from(input.bytes),
        wasm = Uint8Array.from(input.wasm);
      const opening = openDocument({ bytes, wasm, expectedSha256: pins[format] });
      bytes.fill(0);
      wasm.fill(0);
      const document = await opening;
      try {
        const { target, literal, text } = editable(document);
        assert.equal(document.sourceSha256, pins[format]);
        document.sdk.enableHistory({ maxEntries: 8, maxCheckpointBytes: 8 * 1024 * 1024 });
        const revision = document.sdk.historyRevision();
        const beforeSaved = document.save();
        const before = Uint8Array.from(format === 'hwp5' ? beforeSaved.bytes : beforeSaved);
        assert.equal(
          document.replaceText({ target, oldText: literal, newText: literal }).changed,
          false,
        );
        assert.equal(current(document, target), text);
        assert.equal(
          document.sdk.historyRevision(),
          revision,
          'Native valid no-op adds no revision',
        );
        for (const request of [
          { target: null, oldText: literal, newText: 'x' },
          { target: { section: NaN, paragraph: target.paragraph }, oldText: literal, newText: 'x' },
          {
            target: { section: target.section, paragraph: 0xffffffff },
            oldText: literal,
            newText: 'x',
          },
          { target, oldText: 'UNIQUE_MISSING_LITERAL_7817', newText: 'x' },
          { target, oldText: literal, newText: '\ud800' },
          { target, oldText: '', newText: 'x' },
          { target, oldText: literal, newText: '\r\n' },
        ])
          assert.throws(() => document.replaceText(request));
        assert.equal(document.sdk.historyRevision(), revision);
        assert.equal(current(document, target), text);
        const afterSaved = document.save();
        const after = format === 'hwp5' ? afterSaved.bytes : afterSaved;
        assert.deepEqual(after, before, 'no-op and rejected requests do not rewrite native bytes');
        after.fill(0);
        const fresh = document.save();
        assert.deepEqual(
          format === 'hwp5' ? fresh.bytes : fresh,
          before,
          'save output owns copied bytes',
        );
        for (const allowStaleLayout of [null, 0, 1, 'true'])
          assert.throws(() => document.save({ allowStaleLayout }), /AllowStaleLayout/);
        // Fault injection checks the adapter boundary, not Native save correctness.
        const nativeSave = document.sdk.save;
        try {
          for (const invalid of [
            new Uint8Array(),
            new ArrayBuffer(8),
            new Uint8Array(128 * 1024 * 1024 + 1),
          ]) {
            document.sdk.save = () =>
              format === 'hwp5' ? { bytes: invalid, layoutRequiresReflow: false } : invalid;
            assert.throws(() => document.save(), /OutputLimitExceeded/);
          }
        } finally {
          document.sdk.save = nativeSave;
        }
      } finally {
        document.close();
      }
      await assert.rejects(openDocument({ ...input, expectedSha256: '0'.repeat(64) }), /Mismatch/);
    },
  );
  test(
    `actual Native ${format}: edit captures target before its first async boundary`,
    { skip: process.env.HWPJS_CLI_NATIVE !== '1', timeout: 25_000 },
    async () => {
      const input = pinnedInputs(format);
      const initial = await openDocument(input);
      let selected;
      try {
        selected = editable(initial);
      } finally {
        initial.close();
      }
      const target = { ...selected.target };
      const pending = edit({
        ...input,
        target,
        replace: selected.literal,
        with: 'TARGET🙂',
        allowStaleLayout: true,
      });
      target.section = 4096;
      target.paragraph = 0xffffffff;
      const result = await pending;
      const reopened = await openDocument({ bytes: result.bytes, wasm: input.wasm });
      try {
        assert.equal(
          current(reopened, selected.target),
          selected.text.replace(selected.literal, 'TARGET🙂'),
        );
      } finally {
        reopened.close();
      }
    },
  );
  test(
    `actual Native ${format}: current coordinates, save/reopen, ambiguity, deletion and SHA`,
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

test(
  'actual Native hwp5: no-op cannot bypass protected control-token boundary validation',
  { skip: process.env.HWPJS_CLI_NATIVE !== '1', timeout: 25_000 },
  async () => {
    const input = pinnedInputs('hwp5');
    const document = await openDocument(input);
    try {
      const original = document.sdk.text(0, 0);
      const literal = /[\u3400-\u9fff]{2,}/u.exec(original)?.[0];
      assert.ok(literal, 'pinned H5 section-control token payload has a literal CJK range');
      const at = findUniqueLiteral(original, literal);
      // Independent existing Native facade is the permission oracle, including same-text input.
      assert.throws(
        () =>
          document.sdk.splice({
            section: 0,
            paragraph: 0,
            startUnit: at,
            endUnit: at + literal.length,
            text: literal,
          }),
        /SplitControlToken/,
      );
      assert.throws(
        () =>
          document.replaceText({
            target: { section: 0, paragraph: 0 },
            oldText: literal,
            newText: literal,
          }),
        /SplitControlToken/,
      );
      assert.equal(document.sdk.text(0, 0), original, 'failed boundary request is atomic');
    } finally {
      document.close();
    }
  },
);
