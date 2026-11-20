import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const required = [
  'H5 OOXML resource reads owned tree and reports backups without interpreting or changing them',
  'H5 OOXML resource rejects missing modern stream and foreign chart namespace without fallback',
  'H5 OOXML presentation observations use direct root ownership across display names and reject nested and similar decoys',
  'H5 batch binary index name keys preserve CFB case and UTF16 length equivalence',
];
test('regular H5 chart root registers exactly synthetic4 without private input dependencies', async () => {
  const build = await readFile(new URL('build.zig', root), 'utf8');
  const entry = build.match(
    /\.\{ \.path = "src\/hwp5_chart_read_only_probe\.zig", \.filters = &\.\{([\s\S]*?)\}, \.step = "test-hwp5-chart-read-only"/,
  );
  assert.ok(entry);
  assert.deepEqual(
    [...entry[1].matchAll(/"([^"\n]+)"/g)].map((row) => row[1]),
    required,
  );
  assert.equal(build.includes('hwp5_chart_read_reference_probe.zig'), false);
  const visited = new Set();
  const declarations = [];
  async function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = await readFile(url, 'utf8');
    assert.doesNotMatch(source, /chart-read-official77c\.hwp|read_only_query_tests\.zig/);
    declarations.push(...[...source.matchAll(/^test "([^"\n]+)"/gm)].map((row) => row[1]));
    for (const [, name] of source.matchAll(/@import\("([^"\n]+\.zig)"\)/g)) {
      await visit(new URL(name, url));
    }
    for (const [, name] of source.matchAll(/@embedFile\("([^"\n]+)"\)/g)) {
      assert.doesNotMatch(name, /official77c/);
      await readFile(new URL(name, url));
    }
  }
  await visit(new URL('src/hwp5_chart_read_only_probe.zig', root));
  for (const name of required)
    assert.equal(declarations.filter((value) => value === name).length, 1);
});
