import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// 생략된 기존 root는 재해석하거나 파일시스템으로 검사하지 않습니다.
export async function resolveDemoFixtureProviderRoot(root, fixtureRoot) {
  if (fixtureRoot === undefined) return root;
  if (typeof fixtureRoot !== 'string' || fixtureRoot.length === 0)
    throw Error('InvalidFixtureRoot');
  const expected = resolve(root, fixtureRoot);
  const canonical = await realpath(expected);
  if (canonical !== expected) throw Error('NonCanonicalFixtureRoot');
  if (!(await stat(canonical)).isDirectory()) throw Error('InvalidFixtureRootDirectory');
  return canonical;
}
