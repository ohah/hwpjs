import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectDocument } from '../src/inspect-document.ts';

const bytesFor = (format) =>
  format === 'hwp5'
    ? Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 7)
    : Uint8Array.of(0x50, 0x4b, 3, 4, 7);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function session(format = 'hwp5', overrides = {}, sdkOverrides = {}) {
  const bytes = bytesFor(format);
  const calls = { close: 0, paragraphCount: [], protection: [], text: 0 };
  const document = {
    format,
    sourceSha256: sha(bytes),
    sectionCount: 1,
    sdk: {
      fileVersion: () => 0x05000107,
      supportsTextSourceProtection: () => true,
      paragraphCount: (section) => {
        calls.paragraphCount.push(section);
        return 2;
      },
      textSourceProtection: (section) => {
        calls.protection.push(section);
        return { mode: 'strict', protected_paragraphs: [false, false], retained_headers: null };
      },
      text: () => {
        calls.text++;
        throw Error('MustNotReadText');
      },
      paragraphTextSnapshot: () => {
        throw Error('MustNotBuildModel');
      },
      save: () => {
        throw Error('MustNotSave');
      },
      ...sdkOverrides,
    },
    close() {
      calls.close++;
    },
    ...overrides,
  };
  const options = { bytes, wasm: Uint8Array.of(0), expectedSha256: sha(bytes) };
  return {
    bytes,
    document,
    calls,
    options,
    inspect: () => inspectDocument(options, { openDocument: () => document }),
  };
}

test('observed Native metadata is separate from schema, unknown security and global editability', async () => {
  const f = session();
  const result = await f.inspect();
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.format, 'hwp5');
  assert.equal(result.sourceSha256, sha(f.bytes));
  assert.equal(result.sourceByteLength, f.bytes.length);
  assert.equal(result.sectionCount, 1);
  assert.deepEqual(result.fileVersion, {
    status: 'observed',
    value: 0x05000107,
    source: 'sdk.fileVersion',
  });
  assert.deepEqual(result.editing.textSourceProtection.value, [
    {
      section: 0,
      paragraphCount: 2,
      protectedParagraphCount: 0,
      mode: 'strict',
      retainedHeaders: null,
    },
  ]);
  for (const value of [...Object.values(result.security), result.editing.documentEditable]) {
    assert.equal(value.status, 'unknown');
    assert.equal(value.value, null);
    assert.ok(value.reason);
  }
  assert.equal(result.editing.textSourceProtection.status, 'observed');
  assert.ok(result.editing.textSourceProtection.source);
  assert.equal(result.inspection.documentModelCollected, false);
  assert.equal(result.inspection.performance, 'not-measured');
  assert.equal(result.inspection.contentTotals.value, null);
  assert.equal(f.calls.text, 0);
  assert.equal(f.calls.close, 1);
});

test('HWPX does not borrow HWP5 metadata or guess unsupported values from opening success', async () => {
  const f = session('hwpx');
  const result = await f.inspect();
  assert.equal(result.fileVersion.status, 'unsupported');
  assert.equal(result.editing.textSourceProtection.status, 'unsupported');
  assert.equal(result.editing.documentEditable.value, null);
  assert.deepEqual(f.calls.protection, []);
  assert.deepEqual(f.calls.paragraphCount, []);
  assert.equal(f.calls.close, 1);
});

test('retained source restrictions are counted only from validated bits, with no edit grant', async () => {
  const bits = [true, false];
  const f = session(
    'hwp5',
    { sectionCount: 2 },
    {
      textSourceProtection: () => ({
        mode: 'retained_memo',
        protected_paragraphs: bits,
        retained_headers: 1,
      }),
    },
  );
  const result = await f.inspect();
  bits[0] = false;
  assert.deepEqual(
    result.editing.textSourceProtection.value.map((v) => v.protectedParagraphCount),
    [1, 1],
  );
  assert.equal(result.editing.documentEditable.status, 'unknown');
  assert.deepEqual(f.calls.paragraphCount, [0, 1]);
});

test('missing capabilities are unsupported, Native query failures and malformed observations remain unknown', async () => {
  const missing = session(
    'hwp5',
    {},
    { fileVersion: undefined, supportsTextSourceProtection: () => false },
  );
  const a = await missing.inspect();
  assert.equal(a.fileVersion.status, 'unsupported');
  assert.equal(a.editing.textSourceProtection.status, 'unsupported');
  assert.deepEqual(missing.calls.protection, []);
  const broken = session(
    'hwp5',
    {},
    {
      fileVersion: () => {
        throw Error('NativeVersionFailed');
      },
      textSourceProtection: () => ({
        mode: 'strict',
        protected_paragraphs: [true, false],
        retained_headers: null,
      }),
    },
  );
  const b = await broken.inspect();
  assert.equal(b.fileVersion.status, 'unknown');
  assert.equal(b.editing.textSourceProtection.status, 'unknown');
  assert.equal(b.editing.textSourceProtection.value, null);
  assert.equal(b.diagnostics.length, 2);
  assert.equal(broken.calls.close, 1);
});

test('incomplete section observations do not become a successful partial/zero restriction summary', async () => {
  const f = session(
    'hwp5',
    { sectionCount: 2 },
    {
      textSourceProtection: (section) => {
        if (section === 1) throw Error('NativeProtectionFailed');
        return { mode: 'strict', protected_paragraphs: [false, false], retained_headers: null };
      },
    },
  );
  const result = await f.inspect();
  assert.equal(result.editing.textSourceProtection.status, 'unknown');
  assert.equal(result.editing.textSourceProtection.value, null);
  assert.deepEqual(result.diagnostics[0].source, { section: 1 });
});

test('protection observation budget is bounded before fetching another section payload', async () => {
  let queries = 0;
  const f = session(
    'hwp5',
    { sectionCount: 3 },
    {
      paragraphCount: () => 100000,
      textSourceProtection: () => {
        queries++;
        return {
          mode: 'strict',
          protected_paragraphs: Array(100000).fill(false),
          retained_headers: null,
        };
      },
    },
  );
  const result = await f.inspect();
  assert.equal(queries, 2);
  assert.equal(result.editing.textSourceProtection.reason, 'ProtectionObservationLimitExceeded');
  assert.equal(result.editing.textSourceProtection.value, null);
  assert.equal(f.calls.close, 1);
});

for (const [name, overrides, pattern] of [
  ['format', { format: 'hwpx' }, /DocumentFormatMismatch/],
  ['snapshot SHA', { sourceSha256: '0'.repeat(64) }, /DocumentSnapshotSha256Mismatch/],
  ['section count', { sectionCount: 0 }, /SectionLimitExceeded/],
  ['fractional count', { sectionCount: 1.1 }, /SectionLimitExceeded/],
  ['missing sdk', { sdk: null }, /InvalidOpenedDocument/],
]) {
  test(`rejects inconsistent ${name} and still closes exactly once`, async () => {
    const f = session('hwp5', overrides);
    await assert.rejects(f.inspect(), pattern);
    assert.equal(f.calls.close, 1);
  });
}

test('expected SHA is independently checked even when an injected opener ignores it', async () => {
  const f = session();
  f.options.expectedSha256 = '0'.repeat(64);
  await assert.rejects(f.inspect(), /SourceSha256Mismatch/);
  assert.equal(f.calls.close, 1);
});

test('caller-owned byte views are captured before async open, without losing snapshot SHA', async () => {
  const f = session('hwpx');
  let accept;
  let captured;
  const waiting = new Promise((resolve) => {
    accept = resolve;
  });
  const result = inspectDocument(f.options, {
    openDocument: (options) => {
      captured = options;
      return waiting;
    },
  });
  f.bytes.fill(0);
  assert.notEqual(captured.bytes, f.bytes);
  assert.equal(captured.expectedSha256, f.document.sourceSha256);
  accept(f.document);
  assert.equal((await result).sourceSha256, f.document.sourceSha256);
  assert.equal(f.calls.close, 1);
});

test('open failure propagates as failure rather than a fabricated unknown document', async () => {
  const f = session();
  const cause = Error('NativeOpenFailed');
  await assert.rejects(
    inspectDocument(f.options, {
      openDocument: () => {
        throw cause;
      },
    }),
    (error) => error === cause,
  );
  assert.equal(f.calls.close, 0);
});

test('close failure rejects successful inspection; primary and cleanup failures are both preserved', async () => {
  const cleanup = Error('NativeCloseFailed');
  const f = session('hwp5', {
    close() {
      throw cleanup;
    },
  });
  await assert.rejects(
    f.inspect(),
    (error) => error.message === 'DocumentInspectionCloseFailed' && error.cause === cleanup,
  );
  f.document.format = 'hwpx';
  await assert.rejects(
    f.inspect(),
    (error) =>
      error instanceof AggregateError &&
      error.message === 'DocumentInspectionAndCloseFailed' &&
      error.errors[0].message === 'DocumentFormatMismatch' &&
      error.errors[1] === cleanup &&
      error.cause === error.errors[0],
  );
});

test('digest failure while open is pending closes the eventual session and preserves the cause', async (t) => {
  const f = session();
  const primary = Error('DigestFailed');
  t.mock.method(globalThis.crypto.subtle, 'digest', async () => {
    throw primary;
  });
  let accept;
  const pending = new Promise((resolve) => {
    accept = resolve;
  });
  const work = inspectDocument(f.options, { openDocument: () => pending });
  await new Promise((resolve) => setImmediate(resolve));
  accept(f.document);
  await assert.rejects(work, (error) => error === primary);
  assert.equal(f.calls.close, 1);
});

test('SDK ownership cannot change the independently captured digest or byte length', async () => {
  const f = session('hwpx');
  const expected = f.document.sourceSha256;
  const info = await inspectDocument(f.options, {
    openDocument: ({ bytes }) => {
      bytes.fill(0);
      return f.document;
    },
  });
  assert.equal(info.sourceSha256, expected);
  assert.equal(info.sourceByteLength, f.bytes.length);
});

for (const [name, sdkOverrides] of [
  ['zero file version', { fileVersion: () => 0 }],
  ['invalid protection capability', { supportsTextSourceProtection: () => 'yes' }],
  ['invalid Native paragraph count', { paragraphCount: () => NaN }],
]) {
  test(`invalid optional observation is unknown: ${name}`, async () => {
    const f = session('hwp5', {}, sdkOverrides);
    const info = await f.inspect();
    const field =
      name === 'zero file version' ? info.fileVersion : info.editing.textSourceProtection;
    assert.equal(field.status, 'unknown');
    assert.equal(field.value, null);
    assert.equal(f.calls.close, 1);
  });
}

test('invalid inputs fail before opening Native', async () => {
  let opened = 0;
  const deps = {
    openDocument: () => {
      opened++;
      throw Error('ShouldNotOpen');
    },
  };
  for (const [options, pattern] of [
    [{ bytes: new ArrayBuffer(4) }, /Uint8Array/],
    [{ bytes: new Uint8Array() }, /Limit/],
    [{ bytes: bytesFor('hwpx'), expectedSha256: 'x' }, /ExpectedSha/],
    [{ bytes: Uint8Array.of(0, 1, 2, 3) }, /Signature/],
  ])
    await assert.rejects(inspectDocument(options, deps), pattern);
  assert.equal(opened, 0);
});

test('module and byte-only fake inspection run with Node imports/globals blocked', () => {
  const url = new URL('../src/inspect-document.ts', import.meta.url).href;
  const program = `import assert from 'node:assert/strict'; import {registerHooks} from 'node:module';
    registerHooks({resolve(name,context,next){if(name.startsWith('node:')||(!name.startsWith('.')&&!name.startsWith('file:')))throw Error('NonBrowserDependency:'+name);return next(name,context)}});
    globalThis.Buffer=undefined;globalThis.process=undefined;globalThis.require=undefined;globalThis.module=undefined;
    const {inspectDocument}=await import(${JSON.stringify(url)});
    const bytes=Uint8Array.of(80,75,3,4,7);const digest=await crypto.subtle.digest('SHA-256',bytes);const sourceSha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');let closed=0;
    const info=await inspectDocument({bytes,wasm:new Uint8Array([0])},{openDocument:()=>({format:'hwpx',sourceSha256,sectionCount:1,sdk:{},close(){closed++}})});
    assert.equal(info.schemaVersion,1);assert.equal(info.security.encryption.value,null);assert.equal(closed,1);`;
  const p = spawnSync(
    process.execPath,
    ['--max-old-space-size=256', '--input-type=module', '-e', program],
    { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 },
  );
  assert.equal(p.status, 0, p.stderr);
});

const nativeEnabled = Boolean(process.env.HWPJS_TEST_WASM);
for (const [format, variable, expectedSHA] of [
  ['hwp5', 'HWPJS_TEST_NOORI', 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f'],
  [
    'hwpx',
    'HWPJS_TEST_NOORI_HWPX',
    '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
  ],
]) {
  test(
    `actual Noori ${format} info, explicit existing WASM only`,
    { skip: !nativeEnabled },
    async () => {
      const safe = (name) => {
        const value = process.env[name];
        assert.ok(
          value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value),
          `explicit safe ${name} required`,
        );
        return value;
      };
      const wasm = await readFile(safe('HWPJS_TEST_WASM'));
      assert.match(process.env.HWPJS_TEST_WASM_SHA256 ?? '', /^[a-f0-9]{64}$/);
      assert.equal(sha(wasm), process.env.HWPJS_TEST_WASM_SHA256);
      const bytes = await readFile(safe(variable));
      assert.equal(sha(bytes), expectedSHA);
      const info = await inspectDocument({ bytes, wasm, expectedSha256: expectedSHA });
      assert.equal(info.schemaVersion, 1);
      assert.equal(info.format, format);
      assert.equal(info.sourceSha256, expectedSHA);
      assert.equal(info.sourceByteLength, bytes.byteLength);
      assert.ok(info.sectionCount > 0);
      assert.equal(info.security.encryption.status, 'unknown');
      assert.equal(info.editing.documentEditable.value, null);
      if (format === 'hwp5') {
        assert.equal(info.fileVersion.status, 'observed');
        assert.equal(info.editing.textSourceProtection.status, 'observed');
      } else assert.equal(info.fileVersion.status, 'unsupported');
    },
  );
}
