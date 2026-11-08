import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, isAbsolute, join, extname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { verifyRaw } from '../../tests/hwp5/style-preservation/text-record-oracle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const forbidden = /hwpers|title-column-roundtrip/i;
function requiredPath(name) {
  const value = process.env[name];
  assert.ok(
    value && isAbsolute(value) && !forbidden.test(value),
    `explicit safe absolute ${name} mandatory`,
  );
  return value;
}
const entry = requiredPath('HWPJS_TEST_CLI_ENTRY');
assert.ok(['.mjs', '.js', '.cjs'].includes(extname(entry)), 'source or main-packaged JS entry');
const entrySHA = process.env.HWPJS_TEST_CLI_ENTRY_SHA256;
assert.match(entrySHA ?? '', /^[a-f0-9]{64}$/, 'explicit CLI entry SHA mandatory');
assert.equal(hash(readFileSync(entry)), entrySHA);
const wasm = requiredPath('HWPJS_TEST_WASM');
const wasmSHA = '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc';
assert.equal(process.env.HWPJS_TEST_WASM_SHA256, wasmSHA, 'exact Native820 only');
assert.equal(hash(readFileSync(wasm)), wasmSHA);
assert.equal(process.version, 'v24.20.0', 'run source and packaged E2E on explicit Node24.20.0');
const fixtures = [
  [
    'noori.hwp',
    'hwp5',
    'HWPJS_TEST_NOORI',
    'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
    65,
    0,
  ],
  [
    'noori.hwpx',
    'hwpx',
    'HWPJS_TEST_NOORI_HWPX',
    '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
    65,
    1,
  ],
  [
    'headerfooter.hwp',
    'hwp5',
    'HWPJS_TEST_HEADERFOOTER',
    '7d5ac7c13eb844532caa8ef5f238517dd929e0a3f8687520851dbddf57c72063',
    4,
    0,
  ],
  [
    'headerfooter.hwpx',
    'hwpx',
    'HWPJS_TEST_HEADERFOOTER_HWPX',
    '0e616fb37380babdec015175e8494ffd6fd766b07a20e77a483f8cd11715e666',
    4,
    1,
  ],
].map(([name, format, key, sha256, paragraphs, base]) => {
  const path = requiredPath(key);
  assert.ok(
    ['legacy/rust/crates/hwp-core/tests/fixtures', 'apps/docs/docs/public/editor/fixtures'].some(
      (dir) => resolve(root, dir, name) === path,
    ),
    'only four named fixture aliases',
  );
  const bytes = readFileSync(path);
  assert.equal(hash(bytes), sha256, name + ' pin');
  return { name, format, path, sha256, bytes, paragraphs, base };
});
const evidence = resolve(
  root,
  'zig-out/verification/cli-ai-r1/e2e',
  `run-${process.pid}-${Date.now()}`,
);
mkdirSync(evidence, { recursive: true });
const invocations = [];
let deadline;
function child(label, command, args, input) {
  const remaining = Math.floor(deadline - performance.now());
  assert.ok(remaining > 0, 'whole E2E wall60s guard');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    encoding: 'utf8',
    timeout: Math.min(12_000, remaining),
    maxBuffer: 4 * 1024 * 1024,
    killSignal: 'SIGTERM',
  });
  const row = {
    label,
    command,
    args,
    pid: result.pid,
    exit: result.status,
    signal: result.signal,
    error: result.error ? String(result.error) : null,
    wallMilliseconds: Math.round(performance.now() - started),
  };
  invocations.push(row);
  writeFileSync(join(evidence, label + '.stdout'), result.stdout ?? '');
  writeFileSync(join(evidence, label + '.stderr'), result.stderr ?? '');
  assert.equal(result.error, undefined, label + ' must not timeout or hit output budget');
  assert.equal(result.signal, null, label + ' must exit normally');
  return result;
}
function cli(label, args) {
  return child(label, process.execPath, [
    '--max-old-space-size=512',
    entry,
    ...args,
    '--wasm',
    wasm,
  ]);
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '', 'successful source/package CLI must not emit diagnostics');
}
function refusal(result, pattern, output) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, pattern);
  assert.match(result.stderr, /published: false/);
  assert.equal(result.stdout, '');
  if (output) assert.equal(existsSync(output), false, 'refusal must not publish a new file');
}
const editArgs = (
  fixture,
  output,
  {
    input = fixture.path,
    sourceSHA = fixture.sha256,
    old = '보도일시',
    replacement = 'CLI🙂CLI🙂',
    target = fixture.format === 'hwp5' ? 's0:p2' : 's0:p3',
    stale = false,
  } = {},
) => [
  'edit',
  input,
  '--target',
  target,
  '--replace',
  old,
  '--with',
  replacement,
  '--expect-sha256',
  sourceSHA,
  '--output',
  output,
  ...(stale ? ['--allow-stale-layout'] : []),
];
function assertRead(result, fixture, outputFormat) {
  success(result);
  const text = result.stdout;
  assert.ok(text.startsWith(`format: ${fixture.format}\ndocumentSHA256: ${fixture.sha256}\n`));
  assert.equal((text.match(/^format: /gm) ?? []).length, 1);
  assert.equal((text.match(/^documentSHA256: /gm) ?? []).length, 1);
  const ids = [...text.matchAll(/Paragraph (s\d+:p\d+) \(native paragraph=(\d+)\):/g)];
  assert.equal(ids.length, fixture.paragraphs);
  assert.equal(new Set(ids.map((m) => m[1])).size, fixture.paragraphs);
  assert.deepEqual(
    ids.map((m) => Number(m[2])).sort((a, b) => a - b),
    Array.from({ length: fixture.paragraphs }, (_, i) => i + fixture.base),
  );
  for (const m of ids) assert.equal(m[1], 's0:p' + m[2]);
  assert.ok(
    [...text].every((c) => {
      const n = c.codePointAt(0);
      return n === 10 || (n > 31 && !(n >= 127 && n <= 159));
    }),
    'no raw terminal controls, including Native paragraph carriage returns',
  );
  assert.equal(text.includes('捤獥'), false, 'no decoded H5 control payload exposed');
  assert.match(text, /Headers \(own definitions; declarations=known, inheritance=unresolved\)/);
  assert.match(text, /Footers \(own definitions; declarations=known, inheritance=unresolved\)/);
  if (outputFormat === 'markdown') assert.match(text, /^# Section /m);
  if (fixture.name.startsWith('noori')) {
    assert.match(text, /Table s0:t\d+ rows=3 columns=4/);
    assert.match(text, /row=0 column=1 rowSpan=1 columnSpan=3/);
    assert.match(text, /Image .*alt not observed/);
    assert.match(text, /content=observed/);
    assert.equal((text.match(/\[Unknown display text/g) ?? []).length, 0);
    assert.doesNotMatch(text, /DisplayTextUnavailable:/);
    if (fixture.format === 'hwp5')
      for (const paragraph of [29, 30, 31, 38])
        assert.match(
          text,
          new RegExp(`Paragraph s0:p${paragraph} [(]native paragraph=${paragraph}[)]: *$`, 'm'),
        );
  } else {
    assert.equal((text.match(/Definition s0:/g) ?? []).length, 2);
    assert.equal((text.match(/Header 이것은 머리말입니다/g) ?? []).length, 1);
    assert.equal((text.match(/Footer 이것은 꼬리말입니다/g) ?? []).length, 1);
    assert.match(text, /apply=both/);
    assert.match(text, /apply=odd/);
  }
}

function assertContentRead(result, fixture, format) {
  success(result);
  const text = result.stdout;
  assert.ok(text.trim(), '문서 내용이 비어 있지 않아야 합니다.');
  assert.doesNotMatch(
    text,
    /^(?:format: |documentSHA256: |AI logical view|#* ?Section s|#* ?Body$)|(?:Paragraph s\d+:p\d+|Table s\d+:t\d+|Cell s\d+:t\d+:c\d+)/m,
    '기본 읽기에는 구현용 구조·메타데이터를 추가하지 않습니다.',
  );
  assert.equal(text.includes(fixture.sha256), false);
  assert.doesNotMatch(text, /Unknown display text|DisplayTextUnavailable/);
  assert.equal(text.includes('捤獥'), false);
  if (fixture.name.startsWith('noori')) {
    for (const content of ['보도일시', '과학기술정보통신부', '용찬재', '한국형발사체', '붙임'])
      assert.ok(text.includes(content), content + ' 본문·표 내용 보존');
    if (format === 'markdown') assert.doesNotMatch(text, /native paragraph=|rowSpan=/);
  } else {
    assert.ok(text.includes('이것은 머리말입니다'));
    assert.ok(text.includes('이것은 꼬리말입니다'));
  }
}

test(
  'actual CLI source or packaged: four pinned reads, atomic new-file edits and independent byte oracles',
  { timeout: 60_000 },
  async (t) => {
    deadline = performance.now() + 58_000;
    let passed = false,
      failures = 0;
    const caseTest = (name, callback) =>
      t.test(name, () => {
        try {
          return callback();
        } catch (error) {
          failures++;
          throw error;
        }
      });
    try {
      for (const fixture of fixtures) {
        for (const format of ['text', 'markdown']) {
          await caseTest(
            `read ${fixture.name} ${format} structure: native IDs and honest logical structures`,
            () => {
              assertRead(
                cli(`read-${fixture.name}-${format}`, [
                  'read',
                  fixture.path,
                  '--format',
                  format,
                  '--view',
                  'structure',
                ]),
                fixture,
                format,
              );
            },
          );
          await caseTest(`read ${fixture.name} ${format}: document content by default`, () => {
            assertContentRead(
              cli(`read-content-${fixture.name}-${format}`, [
                'read',
                fixture.path,
                '--format',
                format,
              ]),
              fixture,
              format,
            );
          });
        }
      }
      for (const fixture of fixtures.slice(0, 2)) {
        const ext = fixture.format === 'hwp5' ? '.hwp' : '.hwpx';
        const output = join(evidence, 'edited-' + fixture.name);
        await caseTest(
          `edit ${fixture.format}: SHA, stale policy, independent output, reopen and refusals`,
          () => {
            const mismatch = join(evidence, 'hash-mismatch' + ext);
            refusal(
              cli(
                'hash-mismatch-' + fixture.format,
                editArgs(fixture, mismatch, { sourceSHA: '0'.repeat(64) }),
              ),
              /SourceSHA256Mismatch/,
              mismatch,
            );
            if (fixture.format === 'hwp5') {
              const stale = join(evidence, 'stale-refused.hwp');
              refusal(
                cli('stale-default-hwp5', editArgs(fixture, stale)),
                /[Rr]eflow|[Ll]ayout|[Ss]tale/,
                stale,
              );
            }
            const result = cli(
              'edit-' + fixture.format,
              editArgs(fixture, output, { stale: fixture.format === 'hwp5' }),
            );
            success(result);
            const bytes = readFileSync(output),
              outputSHA = hash(bytes);
            assert.notEqual(outputSHA, fixture.sha256);
            assert.ok(result.stdout.includes('sha256: ' + outputSHA + '\n'));
            assert.match(result.stdout, /changed: true/);
            if (fixture.format === 'hwp5') {
              assert.match(result.stdout, /layoutRequiresReflow: true/);
              verifyRaw(fixture.bytes, bytes, 0, 2, 0, 4, 'CLI🙂CLI🙂');
              assert.throws(() => verifyRaw(fixture.bytes, bytes, 0, 2, 0, 4, 'WRONG'), {
                code: 'ERR_ASSERTION',
              });
            } else {
              assert.match(result.stdout, /layoutRequiresReflow: false/);
              // This pinned Noori native s0:p3 is independently the third selected
              // paragraph in section0.xml; this is not a general ordinal conversion.
              const request = {
                before: fixture.bytes.toString('base64'),
                after: bytes.toString('base64'),
                part: 'Contents/section0.xml',
                index: 2,
                paragraph_order: 'selected_default',
                start: 0,
                end: 4,
                text: 'CLI🙂CLI🙂',
              };
              const oracle = resolve(root, 'tools/hwpx-plain-splice-oracle.py');
              for (const optimized of [false, true]) {
                const args = ['-I', '-B', ...(optimized ? ['-O'] : []), oracle];
                const label = 'hwpx-oracle-' + (optimized ? 'optimized' : 'normal');
                const good = child(label, 'python3', args, JSON.stringify(request));
                assert.equal(good.status, 0, good.stderr);
                const wrong = child(
                  label + '-negative',
                  'python3',
                  args,
                  JSON.stringify({ ...request, text: 'WRONG' }),
                );
                assert.equal(wrong.status, 1);
                assert.match(wrong.stderr, /Whole XML mismatch/);
              }
            }
            const reread = cli('reopen-' + fixture.format, ['read', output, '--view', 'structure']);
            success(reread);
            assert.ok(reread.stdout.includes('documentSHA256: ' + outputSHA + '\n'));
            assert.match(reread.stdout, /Paragraph s0:p[23] \(native paragraph=[23]\): CLI🙂CLI🙂/);
            const ambiguous = join(evidence, 'ambiguous' + ext);
            refusal(
              cli(
                'ambiguity-' + fixture.format,
                editArgs(fixture, ambiguous, {
                  input: output,
                  sourceSHA: outputSHA,
                  old: 'CLI🙂',
                  replacement: 'x',
                  stale: fixture.format === 'hwp5',
                }),
              ),
              /Ambiguous/,
              ambiguous,
            );
            const duplicate = cli(
              'no-overwrite-' + fixture.format,
              editArgs(fixture, output, { stale: true }),
            );
            refusal(duplicate, /OutputExists/);
            assert.equal(hash(readFileSync(output)), outputSHA);
            refusal(
              cli(
                'source-collision-' + fixture.format,
                editArgs(fixture, fixture.path, { stale: true }),
              ),
              /SourceOutputCollision/,
            );
            const missing = join(evidence, 'missing-literal' + ext);
            refusal(
              cli(
                'missing-literal-' + fixture.format,
                editArgs(fixture, missing, { old: 'CLI_ABSENT_UNIQUE_LITERAL_7f9a', stale: true }),
              ),
              /NotFound/,
              missing,
            );
          },
        );
      }
      passed = failures === 0 && !t.signal.aborted;
    } finally {
      for (const fixture of fixtures)
        assert.equal(
          hash(readFileSync(fixture.path)),
          fixture.sha256,
          'original fixture unchanged',
        );
      assert.equal(hash(readFileSync(entry)), entrySHA, 'entry unchanged during this cohort');
      assert.equal(hash(readFileSync(wasm)), wasmSHA);
      writeFileSync(
        join(evidence, 'RESULT.json'),
        JSON.stringify(
          {
            passed,
            entry,
            entrySHA256: entrySHA,
            wasmSHA256: wasmSHA,
            fixturePins: fixtures.map(({ name, path, sha256 }) => ({ name, path, sha256 })),
            invocations,
            sequentialChildren: true,
            deadlineSeconds: 60,
            fixturesUnchanged: true,
            entryUnchanged: true,
            Node: process.version,
            heapMiBPerChild: 512,
          },
          null,
          2,
        ) + '\n',
      );
      t.diagnostic('Evidence: ' + evidence);
    }
  },
);
