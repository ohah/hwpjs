import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export function documentSearchTargets(buildSource) {
  const start = '// Document search Native registration (SSOT).',
    end = '// End document search Native registration.';
  assert.equal(buildSource.split(start).length, 2, 'MissingOrDuplicateSearchRegistration');
  assert.equal(buildSource.split(end).length, 2, 'MissingOrDuplicateSearchRegistration');
  const block = buildSource.slice(
    buildSource.indexOf(start) + start.length,
    buildSource.indexOf(end),
  );
  const code = block.replace(/\s+/g, '');
  for (const guard of [
    'b.step("test-document-search",',
    'root_source_file=b.path(contract.path)',
    'use_llvm=true',
    'filters=&.{contract.filter}',
    'focused.dependOn(&run.step)',
    'document_search_step.dependOn(&run.step)',
    'core_test_step.dependOn(&run.step)',
  ])
    assert(code.includes(guard), 'MissingNativeSearchEdge:' + guard);
  const targets = [
    ...block.matchAll(
      /\.\{\s*\.path\s*=\s*"([^"]+)"\s*,\s*\.filter\s*=\s*"([^"]+)"\s*,\s*\.step\s*=\s*"([^"]+)"\s*,\s*\.named\s*=\s*(\d+)\s*\}/g,
    ),
  ].map(([, path, filter, step, named]) => ({ path, filter, step, named: Number(named) }));
  assert.equal(targets.length, 13, 'ExpectedThirteenSearchTargets');
  const paths = new Set(),
    steps = new Set();
  for (const t of targets) {
    assert(/^src\/[a-z_]+_probe\.zig$/.test(t.path), 'UnsafeSearchTarget');
    assert(t.filter.length > 0 && t.filter.length < 100, 'InvalidSearchFilter');
    assert(/^test-document-search-[a-z-]+$/.test(t.step), 'InvalidFocusedStep');
    assert(t.named > 0 && t.named < 100, 'InvalidExpectedNamed');
    assert(!paths.has(t.path) && !steps.has(t.step), 'DuplicateSearchTarget');
    paths.add(t.path);
    steps.add(t.step);
  }
  return targets;
}
export function nativeSearchResults(text, filter) {
  const starts = [...text.matchAll(/^\d+\/\d+ .*?\.\.\./gm)],
    rows = [];
  for (let i = 0; i < starts.length; i++) {
    const block = text.slice(starts[i].index, starts[i + 1]?.index ?? text.length),
      headline = starts[i][0];
    const status = block.match(/(?:\.\.\.|\n)(OK|FAIL[^\n]*)(?:\n|$)/);
    rows.push({
      headline,
      kind: headline.includes(filter) ? 'named' : 'anonymous',
      result: status?.[1] === 'OK' ? 'pass' : status ? 'fail' : 'unknown',
    });
  }
  return rows;
}
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
