import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const build = readFileSync(new URL('build.zig', root), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/javascript-quality.yml', root), 'utf8');
function registration(source) {
  const begin = source.indexOf('const editor_extensions_step =');
  const end = source.indexOf('const portable_tests =', begin);
  assert(begin >= 0 && end > begin, 'MissingEditorExtensionLoop');
  const loop = source.slice(begin, end);
  const entries = [
    ...loop.matchAll(/\.path = "([^"]+)", \.filters = &\.\{"([^"]+)"\}, \.step = "([^"]+)"/g),
  ].map(([, path, filter, step]) => ({ path, filter, step }));
  const edge = (target, dependency) =>
    loop.includes(target + '.dependOn(&' + dependency + '.step);');
  for (const key of ['path', 'step'])
    assert.equal(new Set(entries.map((row) => row[key])).size, entries.length);
  assert.match(loop, /\.use_llvm = true/);
  assert.match(loop, /\.filters = entry\.filters/);
  assert.match(loop, /\.root_source_file = b\.path\(entry\.path\)/);
  assert.match(loop, /const run_extension_tests = b\.addRunArtifact\(extension_tests\)/);
  assert.match(loop, /const extension_step = b\.step\(entry\.step, entry\.description\)/);
  for (const dependency of ['abi_check', 'icc_registry_check'])
    assert(edge('run_extension_tests.step', dependency), 'MissingPrerequisite:' + dependency);
  for (const target of ['extension_step', 'editor_extensions_step', 'core_test_step'])
    assert(edge(target, 'run_extension_tests'), 'MissingAggregate:' + target);
  return entries;
}

test('generated rich eight have one filtered LLVM step in direct and aggregate test graphs', () => {
  assert.deepEqual(
    registration(build).filter((row) => row.path === 'src/generated_cell_rich_transfer_probe.zig'),
    [
      {
        path: 'src/generated_cell_rich_transfer_probe.zig',
        filter: 'generated cell rich',
        step: 'test-generated-cell-rich',
      },
    ],
  );
});

test('geometry keeps its existing path, filter and regular step', () => {
  assert.deepEqual(
    registration(build).filter((row) => row.path === 'src/object_geometry_probe.zig'),
    [
      {
        path: 'src/object_geometry_probe.zig',
        filter: 'object geometry',
        step: 'test-object-geometry',
      },
    ],
  );
});

test('missing ABI, ICC or aggregate edges are rejected by the registration oracle', () => {
  for (const line of [
    'run_extension_tests.step.dependOn(&abi_check.step);',
    'run_extension_tests.step.dependOn(&icc_registry_check.step);',
    'extension_step.dependOn(&run_extension_tests.step);',
    'editor_extensions_step.dependOn(&run_extension_tests.step);',
    'core_test_step.dependOn(&run_extension_tests.step);',
  ]) {
    assert(build.includes(line));
    assert.throws(() => registration(build.replace(line, '')));
  }
});

test('duplicate test registration is rejected instead of hiding behind a count', () => {
  const line = build
    .split('\n')
    .find((row) => row.includes('src/generated_cell_rich_transfer_probe.zig'));
  assert(line);
  assert.throws(() => registration(build.replace(line, line + '\n' + line)));
});

test('the filtered probe source still declares exactly the reviewed eight named cases', () => {
  const names = [
    'src/generated_cell_rich_transfer_probe.zig',
    'src/generated_cell_rich_native_probe.zig',
    'src/model/authored_paragraph.zig',
    'src/model/equality.zig',
  ].flatMap((path) =>
    [...readFileSync(new URL(path, root), 'utf8').matchAll(/^test "([^"]+)"/gm)]
      .map((match) => match[1])
      .filter((name) => name.startsWith('generated cell rich ')),
  );
  assert.equal(names.length, 8);
  assert.equal(new Set(names).size, 8);
  assert(
    names.includes(
      'generated cell rich model equality distinguishes inherited ownership and deep run values',
    ),
  );
  assert(
    names.includes(
      'generated cell rich HX serializer receipt and physical promotion preserve rich D and exact history',
    ),
  );
});

test('JavaScript quality CI executes this source registration guard', () => {
  assert.match(
    workflow,
    /run: node --test --test-concurrency=1 tools\/tests\/generated-cell-native-registration\.test\.mjs/,
  );
});
