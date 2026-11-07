import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDeclarationInputs, isProductionSource } from '../build/source-policy.mjs';

test('실제 로컬 ts/tsx/mts/cts/d.mts와 패키지 밖 선언을 중복 없이 선택한다', () => {
  const paths = [
    '/repo/packages/core/src/a.ts',
    '/repo/packages/react/src/a.tsx',
    '/repo/web/preview/range.d.mts',
    '/repo/js/a.mts',
    '/repo/apps/demo/a.cts',
    '/repo/types/global.d.ts',
  ];
  const result = selectDeclarationInputs('/repo', paths.concat(paths).join('\r\n') + '\n');
  assert.deepEqual(result, { projectInputs: paths, dependencyInputs: [], excludedTestInputs: [] });
});
test('프로젝트 경계를 접두사나 상대 경로로 우회하지 못한다', () => {
  for (const path of ['/repo-other/types/a.d.ts', '/repo/../outside/a.d.ts', 'relative/a.ts'])
    assert.throws(
      () => selectDeclarationInputs('/repo', path),
      /UnownedTypeGraphInput|NonAbsoluteTypeGraphInput/,
    );
  assert.throws(() => selectDeclarationInputs('relative', '/repo/a.ts'), /InvalidDeclarationGraph/);
  assert.throws(() => selectDeclarationInputs('/repo', null), /InvalidDeclarationGraph/);
});
test('의존성 및 표준 타입은 node_modules 경계로 별도 분류한다', () => {
  const deps = [
    '/repo/node_modules/typescript/lib/lib.es2023.d.ts',
    '/repo/packages/core/node_modules/types/a.d.mts',
    '/tools/node_modules/@types/node/index.d.ts',
  ];
  const result = selectDeclarationInputs('/repo', deps.join('\n'));
  assert.deepEqual(result.dependencyInputs, deps);
  assert.deepEqual(result.projectInputs, []);
});
test('기존 정책이 허용한 tests 소비 선언은 관측하고 거부한 입력은 명시 실패한다', () => {
  const consumed = [
    '/repo/packages/core/tests/helper.ts',
    '/repo/packages/core/tests/consumed-public-type.d.ts',
    '/repo/test/fixture.ts',
  ];
  assert.deepEqual(selectDeclarationInputs('/repo', consumed.join('\n')).projectInputs, consumed);
  for (const path of ['/repo/web/__tests__/fixture.d.mts', '/repo/a.test.ts', '/repo/a.spec.cts']) {
    assert.equal(isProductionSource(path), false);
    assert.throws(() => selectDeclarationInputs('/repo', path), /NonProductionTypeGraphInput/);
  }
  assert.equal(isProductionSource(consumed[1]), true);
});
test('미지원 로컬 그래프 입력을 조용히 생략하지 않는다', () => {
  for (const path of ['/repo/local.bin', '/repo/local.mjs', '/repo/node_modules-like/a.js'])
    assert.throws(() => selectDeclarationInputs('/repo', path), /UnsupportedProjectTypeGraphInput/);
});
test('경로 정규화와 디렉터리 이름의 정확한 경계를 적용한다', () => {
  assert.deepEqual(selectDeclarationInputs('/repo/', '/repo/a/../types/a.d.mts').projectInputs, [
    '/repo/types/a.d.mts',
  ]);
  assert.deepEqual(
    selectDeclarationInputs('/work/node_modules/project', '/work/node_modules/project/src/a.ts')
      .projectInputs,
    ['/work/node_modules/project/src/a.ts'],
  );
  assert.deepEqual(selectDeclarationInputs('/repo', '/repo/node_modules-like/a.ts').projectInputs, [
    '/repo/node_modules-like/a.ts',
  ]);
  assert.deepEqual(selectDeclarationInputs('/repo', '/repo/contest/a.ts').projectInputs, [
    '/repo/contest/a.ts',
  ]);
});
test('그래프에서 필수 companion 세 선언이 모두 관측 대상으로 남는다', () => {
  const names = ['host-epoch-readers', 'range-atomic-formatting', 'range-formatting-binding'];
  const paths = names.map((name) => '/repo/web/preview/' + name + '.d.mts');
  assert.deepEqual(selectDeclarationInputs('/repo', paths.join('\n')).projectInputs, paths);
});

test('실제 resolveJsonModule 데이터도 타입 그래프 입력으로 관측한다', () => {
  const path = '/repo/packages/core/src/keymap/defaults.json';
  assert.deepEqual(selectDeclarationInputs('/repo', path).projectInputs, [path]);
});
