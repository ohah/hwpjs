import { createHash } from 'node:crypto';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stable = 'runtime/worker.js';
const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 기존 stable-only manifest는 기존 Worker를 active로 읽습니다. */
export function readWorkerAssets(manifest) {
  const rows = manifest.files;
  if (!Array.isArray(rows)) throw Error('InvalidWorkerManifest');
  const index = new Map();
  for (const row of rows) {
    if (!plain(row) || typeof row.path !== 'string' || index.has(row.path))
      throw Error('InvalidWorkerManifest');
    index.set(row.path, row);
  }
  const legacy = index.get(stable);
  if (!legacy || !validHash(legacy.sha256)) throw Error('MissingLegacyWorker');
  const value = manifest.workerAssets;
  if (value === undefined)
    return {
      activeWorkerPath: stable,
      activeWorkerSha256: legacy.sha256,
      legacyWorkerPath: stable,
      legacyWorkerSha256: legacy.sha256,
      activeRuntimePaths: [],
    };
  if (
    !plain(value) ||
    value.version !== 1 ||
    Object.keys(value).sort().join(',') !==
      'activeRuntimePaths,activeWorkerPath,activeWorkerSha256,legacyWorkerPath,legacyWorkerSha256,version' ||
    !validHash(value.activeWorkerSha256) ||
    !validHash(value.legacyWorkerSha256) ||
    value.activeWorkerPath !== `runtime/worker-${value.activeWorkerSha256}.js` ||
    value.legacyWorkerPath !== stable ||
    value.legacyWorkerSha256 !== legacy.sha256 ||
    !Array.isArray(value.activeRuntimePaths) ||
    value.activeRuntimePaths.length === 0
  )
    throw Error('InvalidWorkerAssets');
  const active = index.get(value.activeWorkerPath);
  if (!active || active.sha256 !== value.activeWorkerSha256)
    throw Error('ActiveWorkerManifestMismatch');
  const seen = new Set();
  for (const path of value.activeRuntimePaths) {
    if (
      typeof path !== 'string' ||
      !/^assets\/[A-Za-z0-9_-]+\.js$/.test(path) ||
      seen.has(path) ||
      !index.has(path)
    )
      throw Error('InvalidActiveRuntimePaths');
    seen.add(path);
  }
  return { ...value, activeRuntimePaths: [...value.activeRuntimePaths] };
}

/** URL만 검사하며 expected hash나 사용자 지정 Worker 권한을 바꾸지 않습니다. */
export function validateWorkerAssets(manifest, files) {
  const policy = readWorkerAssets(manifest);
  for (const [path, expected] of [
    [policy.activeWorkerPath, policy.activeWorkerSha256],
    [policy.legacyWorkerPath, policy.legacyWorkerSha256],
  ]) {
    const bytes = files.get(path);
    if (!Buffer.isBuffer(bytes) || hash(bytes) !== expected)
      throw Error('WorkerBytesMismatch:' + path);
  }
  if (manifest.workerAssets === undefined) return policy;
  if (
    manifest.privateDemo?.workerSHA256 !== undefined &&
    manifest.privateDemo.workerSHA256 !== policy.activeWorkerSha256
  )
    throw Error('PrivateActiveWorkerPolicyMismatch');
  const expected = new RegExp('(["\'`])' + policy.activeWorkerSha256 + '\\1');
  const declared = new Set(policy.activeRuntimePaths),
    actual = new Set();
  for (const [path, bytes] of files) {
    if (!path.endsWith('.js') || path.startsWith('runtime/worker')) continue;
    const source = bytes.toString();
    const containsExpectedHash = expected.test(source);
    for (const match of source.matchAll(
      /new URL\(\s*(["'`])([^"'`]+)\1\s*,\s*import\.meta\.url\s*\)/g,
    )) {
      const url = new URL(match[2], 'https://static.invalid/editor/' + path);
      if (url.pathname !== '/editor/' + policy.activeWorkerPath) continue;
      if (url.origin !== 'https://static.invalid' || url.search || url.hash || !declared.has(path))
        throw Error('UnexpectedActiveWorkerReference:' + path);
      if (!containsExpectedHash) throw Error('ActiveWorkerExpectedHashMissing:' + path);
      actual.add(path);
    }
  }
  if (actual.size !== declared.size || [...declared].some((path) => !actual.has(path)))
    throw Error('ActiveWorkerReferenceMissing');
  return policy;
}

export function discoverActiveRuntimePaths(files, activeWorkerPath) {
  const found = [];
  for (const [path, bytes] of files) {
    if (!path.endsWith('.js') || path.startsWith('runtime/worker')) continue;
    for (const match of bytes
      .toString()
      .matchAll(/new URL\(\s*(["'`])([^"'`]+)\1\s*,\s*import\.meta\.url\s*\)/g)) {
      const url = new URL(match[2], 'https://static.invalid/editor/' + path);
      if (url.pathname === '/editor/' + activeWorkerPath) {
        found.push(path);
        break;
      }
    }
  }
  return found;
}

export function validateWorkerPair(privateBundle, publicBundle) {
  const a = validateWorkerAssets(privateBundle.manifest, privateBundle.files);
  const b = validateWorkerAssets(publicBundle.manifest, publicBundle.files);
  for (const key of ['activeWorkerPath', 'legacyWorkerPath'])
    if (
      a[key] !== b[key] ||
      !privateBundle.files.get(a[key]).equals(publicBundle.files.get(b[key]))
    )
      throw Error('PrivateWorkerDrift');
  return a;
}

/** assembler가 새 manifest에 넣을 값입니다. hash명 충돌 시 조용히 덮지 않습니다. */
export function installWorkerAssets(files, { activeBytes, legacyBytes, activeRuntimePaths }) {
  const activeWorkerSha256 = hash(activeBytes),
    activeWorkerPath = `runtime/worker-${activeWorkerSha256}.js`;
  const present = files.get(activeWorkerPath);
  if (present && !present.equals(activeBytes)) throw Error('WorkerAssetCollision');
  files.set(activeWorkerPath, Buffer.from(activeBytes));
  files.set(stable, Buffer.from(legacyBytes));
  return {
    version: 1,
    activeWorkerPath,
    activeWorkerSha256,
    legacyWorkerPath: stable,
    legacyWorkerSha256: hash(legacyBytes),
    activeRuntimePaths: [...activeRuntimePaths],
  };
}
