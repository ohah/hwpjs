import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lexicalPath,
  guardAbsolute,
  extractZigDependencies,
  sourcesFromFailures,
  preflight,
} from '../native-fixture-preflight.mjs';
const prefix = 'legacy/rust/crates/hwp-core/tests/fixtures/';
const read = (expression) => `std.Io.Dir.cwd().readFileAlloc(io, ${expression}, a, .limited(100));`;
const hash = (b) => createHash('sha256').update(b).digest('hex');
function workspace(t) {
  const base = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'native-fixture-preflight-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'zig-out/verification/document-transforms-connect-r1/source');
  fs.mkdirSync(join(root, 'src'), { recursive: true });
  return {
    base,
    root,
    write(relative, text) {
      const path = join(root, relative);
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(path, text);
      return path;
    },
  };
}
function observedIo() {
  const events = [];
  return {
    events,
    io: {
      lstatSync(path) {
        events.push(['lstat', path]);
        return fs.lstatSync(path);
      },
      readFileSync(path, ...args) {
        events.push(['read', path]);
        return fs.readFileSync(path, ...args);
      },
    },
  };
}
test('literal extraction uses comments-aware tokens and bounded same-file const concatenations', () => {
  const code = `const base: []const u8 = "${prefix}"; const name = "one.hwp";
// ${read('"reference/rhwp/never.hwp"')}
const example = "cwd().readFileAlloc(io, \\"nope\\", a, x)";
${read('(base ++ name)')}
${read('"apps/docs/docs/public/editor/fixtures/noori.hwpx"')}
std.Io.Dir.cwd().openDir(io, "reference/rhwp/chart", .{ .iterate = true });`;
  const result = extractZigDependencies(code);
  assert.deepEqual(
    result.references.map((r) => r.path),
    [
      prefix + 'one.hwp',
      'apps/docs/docs/public/editor/fixtures/noori.hwpx',
      'reference/rhwp/chart',
    ],
  );
  assert(result.references.every((r) => r.line > 1));
});
test('dynamic loops, array fields and import aliases remain unresolved without guessing', () => {
  const code = `const upstream = @import("baseline"); const rows = .{ .path = "${prefix}noori.hwpx" }; ${read('c.path')} dir.readFileAlloc(io, entry.path, a, .limited(20));`;
  const result = extractZigDependencies(code);
  assert.deepEqual(
    result.references.map((r) => r.status),
    ['unresolved', 'unresolved'],
  );
  assert.equal(result.references[1].reason, 'NonCwdDirectoryHandle');
  assert.equal(result.literalHints[0].accessed, false);
  assert.deepEqual(result.imports, [{ path: 'baseline', line: 1, followed: false }]);
});
test('shadowed constants, cycles and unsupported expressions never select an arbitrary path', () => {
  for (const code of [
    `const p = "${prefix}a"; { const p = "${prefix}b"; ${read('p')} }`,
    `const p = q; const q = p; ${read('p')}`,
    `const p = buildPath(); ${read('p')}`,
    read('std.fmt.allocPrint(a, "x", .{})'),
  ])
    assert.equal(extractZigDependencies(code).references[0].status, 'unresolved');
});
test('protected/reference/traversal lexical decisions happen before any filesystem operation', () => {
  const spy = {
    lstatSync() {
      throw new Error('Forbidden filesystem access');
    },
  };
  for (const path of [
    '/tmp/reference/rhwp/a',
    '/tmp/legacy/hwpers/x',
    '/tmp/title-column-roundtrip.test.mjs',
    '/tmp/a/../b',
    '/tmp/a\\b',
    '/tmp/a\0b',
  ]) {
    assert.equal(guardAbsolute(path, spy).status, 'denied');
  }
  for (const path of [
    'reference/rhwp/a.hwp',
    'reference/other/x',
    prefix + '../x',
    '/' + prefix + 'x',
    prefix + 'title-column-roundtrip.test.mjs',
    'legacy/hwpers/x',
  ])
    assert.equal(lexicalPath(path)?.status, 'denied');
});
test('present missing unresolved denied are distinct and denied artifacts have no access', (t) => {
  const w = workspace(t),
    data = Buffer.from('approved synthetic bytes');
  w.write(prefix + 'ok.hwp', data);
  w.write(
    'src/sample.zig',
    [
      read('"' + prefix + 'ok.hwp"'),
      read('"' + prefix + 'missing.hwp"'),
      read('"reference/rhwp/do-not-touch.hwp"'),
      read('runtime_path'),
    ].join('\n'),
  );
  const { events, io } = observedIo();
  const report = preflight({ sourceRoot: w.root, selectedSources: ['src/sample.zig'] }, io);
  assert.deepEqual(
    report.files[0].references.map((r) => r.status),
    ['present', 'missing', 'denied', 'unresolved'],
  );
  assert.equal(report.files[0].references[0].sha256, hash(data));
  assert(!events.some(([, p]) => p.includes('/reference/')));
  assert.equal(report.selectedStaticInputsAvailable, false);
  assert.equal(report.allNativeFixturesReady, false);
});
test('fixture and source symlink aliases are refused without following or reading targets', (t) => {
  const w = workspace(t);
  const outside = join(w.base, 'target');
  fs.writeFileSync(outside, 'never read this');
  w.write(prefix + 'placeholder', '');
  fs.symlinkSync(outside, join(w.root, prefix + 'alias.hwp'));
  w.write('src/a.zig', read('"' + prefix + 'alias.hwp"'));
  fs.symlinkSync(outside, join(w.root, 'src/alias.zig'));
  const { events, io } = observedIo();
  const report = preflight(
    { sourceRoot: w.root, selectedSources: ['src/a.zig', 'src/alias.zig'] },
    io,
  );
  assert.equal(report.files[0].references[0].reason, 'SymlinkAlias');
  assert.equal(report.files[1].source.reason, 'SymlinkAlias');
  assert(
    !events.some(
      ([kind, path]) =>
        kind === 'read' &&
        [outside, join(w.root, prefix + 'alias.hwp'), join(w.root, 'src/alias.zig')].includes(path),
    ),
  );
});
test('directory handles are not enumerated and root aliases are denied before source reads', (t) => {
  const w = workspace(t);
  fs.mkdirSync(join(w.root, prefix + 'sub'), { recursive: true });
  w.write('src/a.zig', `std.Io.Dir.cwd().openDir(io, "${prefix}sub", .{});`);
  const report = preflight({ sourceRoot: w.root, selectedSources: ['src/a.zig'] });
  assert.equal(report.files[0].references[0].reason, 'DirectoryEnumerationNotPerformed');
  const alias = join(w.base, 'source-alias');
  fs.symlinkSync(w.root, alias);
  assert.throws(
    () => preflight({ sourceRoot: alias, selectedSources: ['src/a.zig'] }),
    /SymlinkAlias/u,
  );
});
test('literal hints are reported but are never opened as proven dependencies', (t) => {
  const w = workspace(t);
  w.write(prefix + 'hint.hwp', 'must remain unread');
  w.write(
    'src/a.zig',
    `const rows = .{ .path = "${prefix}hint.hwp", .other = "reference/rhwp/denied.hwp" }; ${read('c.path')}`,
  );
  const { events, io } = observedIo();
  const report = preflight({ sourceRoot: w.root, selectedSources: ['src/a.zig'] }, io);
  assert.deepEqual(
    report.files[0].literalHints.map((h) => h.status),
    ['unresolved', 'denied'],
  );
  assert(!events.some(([, p]) => p.includes('/fixtures/')));
});
test('failure selection derives modules from only FileNotFound labels and keeps unmapped labels explicit', () => {
  const selection = sourcesFromFailures({
    results: [
      { name: 'hwpx.example.test.a', result: 'FileNotFound' },
      { name: 'hwpx.example.test.b', result: 'FileNotFound' },
      { name: 'hwpx.elsewhere.test.c', result: 'passed' },
      { name: 'unmapped', result: 'FileNotFound' },
    ],
  });
  assert.deepEqual(selection.selected, [
    { path: 'src/hwpx/example.zig', labels: ['hwpx.example.test.a', 'hwpx.example.test.b'] },
  ]);
  assert.equal(selection.unresolved.length, 1);
});
test('unsupported string forms and excessive source are explicit rather than evaluated', () => {
  assert.equal(extractZigDependencies(read('"\\qunsupported"')).references[0].status, 'unresolved');
  assert.throws(() => extractZigDependencies(' '.repeat(2 * 1024 * 1024 + 1)), /SourceSizeLimit/u);
});
test('CLI writes fresh evidence outside controlled source and exits nonzero for missing inputs', (t) => {
  const w = workspace(t);
  w.write('src/a.zig', read('"' + prefix + 'missing.hwp"'));
  const report = join(w.base, 'zig-out/verification/result.json');
  const tool = fileURLToPath(new URL('../native-fixture-preflight.mjs', import.meta.url));
  const child = spawnSync(
    process.execPath,
    [tool, '--source-root', w.root, '--source-file', 'src/a.zig', '--report', report],
    { encoding: 'utf8' },
  );
  assert.equal(child.status, 1, child.stderr);
  assert.equal(JSON.parse(fs.readFileSync(report)).counts.missing, 1);
  const again = spawnSync(
    process.execPath,
    [tool, '--source-root', w.root, '--source-file', 'src/a.zig', '--report', report],
    { encoding: 'utf8' },
  );
  assert.equal(again.status, 2);
  assert.match(again.stderr, /EEXIST/u);
  const inside = spawnSync(
    process.execPath,
    [
      tool,
      '--source-root',
      w.root,
      '--source-file',
      'src/a.zig',
      '--report',
      join(w.root, 'result.json'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /OutsideControlled/u);
});

test('parameters var and capture names cannot be mistaken for same-named const paths', () => {
  for (const code of [
    `const p = "${prefix}a"; fn f(p: []const u8) void { ${read('p')} }`,
    `const p = "${prefix}a"; { var p = runtime(); ${read('p')} }`,
    `const p = "${prefix}a"; for (paths) |p| { ${read('p')} }`,
  ])
    assert.equal(extractZigDependencies(code).references[0].status, 'unresolved');
});
test('receipt label verification uses actual selected source test declarations', (t) => {
  const w = workspace(t);
  w.write('src/a.zig', 'test "real" {}');
  const report = preflight({
    sourceRoot: w.root,
    selectedSources: [{ path: 'src/a.zig', labels: ['a.test.real', 'a.test.wrong'] }],
  });
  assert.equal(report.verifiedSourceTestLabels, 1);
  assert.equal(report.counts.unresolved, 1);
  assert.equal(report.files[0].unresolvedLabels[0].label, 'a.test.wrong');
});
