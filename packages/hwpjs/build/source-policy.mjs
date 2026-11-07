import { isAbsolute, relative, resolve, sep } from 'node:path';

/** One policy for build fingerprints, declaration inputs and copied ambient declarations. */
export function isProductionSource(path) {
  return !/(?:^|[\\/])__tests__(?:[\\/]|$)/.test(path) && !/\.(?:test|spec)\./.test(path);
}

/** 실제 타입 그래프에서 프로젝트 입력과 버전/lock 경계의 외부 타입을 분리한다.
 * 경로 검사는 파일 접근 없이 수행한다. 프로젝트 밖 임의 입력이나 알 수 없는
 * 프로젝트 입력을 조용히 누락하지 않고 거부한다. resolveJsonModule로
 * 그래프에 포함되는 로컬 JSON 데이터도 같은 입력 지문으로 관측한다. 기존 제품 정책은 변경하지 않는다.
 */
export function selectDeclarationInputs(root, graphOutput) {
  if (typeof root !== 'string' || !isAbsolute(root) || typeof graphOutput !== 'string')
    throw new TypeError('InvalidDeclarationGraph');
  const projectRoot = resolve(root);
  const projectInputs = [],
    dependencyInputs = [],
    excludedTestInputs = [],
    seen = new Set();
  for (const raw of graphOutput.split(/\r?\n/)) {
    if (!raw) continue;
    if (!isAbsolute(raw)) throw Error('NonAbsoluteTypeGraphInput:' + raw);
    const path = resolve(raw);
    if (seen.has(path)) continue;
    seen.add(path);
    const local = relative(projectRoot, path);
    const inside = local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local);
    const parts = (inside ? local : path).split(sep);
    if (parts.includes('node_modules')) {
      dependencyInputs.push(path);
      continue;
    }
    if (!inside) throw Error('UnownedTypeGraphInput:' + path);
    if (!isProductionSource(path)) throw Error('NonProductionTypeGraphInput:' + path);
    if (!/\.(?:tsx?|mts|cts|json)$/.test(path))
      throw Error('UnsupportedProjectTypeGraphInput:' + path);
    projectInputs.push(path);
  }
  return { projectInputs, dependencyInputs, excludedTestInputs };
}
