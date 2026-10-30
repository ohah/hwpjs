import { createHash } from 'node:crypto';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const original = 'new URL("./worker.js", import.meta.url)';

/** SDK 재빌드가 아닌 Vite 입력 변환입니다. 기존 공개 hash 청크는 입력 대상이 아닙니다. */
export function canonicalWorkerURLPlugin({
  runtimePath,
  runtimeSha256,
  workerBytes,
  workerSha256,
}) {
  if (
    !runtimePath.startsWith('/') ||
    !/^[a-f0-9]{64}$/.test(runtimeSha256) ||
    !/^[a-f0-9]{64}$/.test(workerSha256) ||
    hash(workerBytes) !== workerSha256
  )
    throw Error('InvalidCanonicalWorkerInput');
  const activeWorkerPath = `runtime/worker-${workerSha256}.js`;
  const workerSource = Buffer.from(workerBytes);
  let consumed = false;
  return {
    name: 'canonical-content-worker-url',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== runtimePath) return null;
      if (
        id !== runtimePath ||
        consumed ||
        hash(code) !== runtimeSha256 ||
        code.split(original).length !== 2 ||
        !code.includes(`var KNOWN_WORKER_CODE_SHA256 = "${workerSha256}";`)
      )
        throw Error('CanonicalRuntimeSourceDrift');
      const reference = this.emitFile({
        type: 'asset',
        fileName: activeWorkerPath,
        source: workerSource,
      });
      if (!/^[A-Za-z0-9_$]+$/.test(reference)) throw Error('InvalidWorkerAssetReference');
      consumed = true;
      return {
        code: code.replace(
          original,
          `new URL(import.meta.ROLLUP_FILE_URL_${reference}, import.meta.url)`,
        ),
        map: null,
      };
    },
    generateBundle() {
      if (!consumed) throw Error('CanonicalRuntimeNotConsumed');
    },
  };
}
