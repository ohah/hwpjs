// Exact low-level-qualified engine only. Hash lookup is metadata, never module authority.
// The only issuer compiles an owned copy of these exact bytes. No registration API.
const artifacts = new Map([
  ['e8c4676c862dd8cdc59acb6c3b0658d7100b0e5d1ecc592e9095729b64f419a5', 5577426],
  ['d252ac5a853fdd185aa31ee5445f985d358a04be0c0dcee1be527ae49f8929a9', 5577841],
  ['1600ead7c4bc75f9094901b44464678790cb9e41fc6d972532bbbeab17c247b7', 5593551],
]);
const allowedLengths = new Set(artifacts.values());
const qualifiedBackendModules = new WeakMap();
const compileWasm = WebAssembly.compile.bind(WebAssembly);
const Module = WebAssembly.Module;
const byteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength',
).get;
const compilations = new Map();
export function hwp5VerticalMarginsArtifactQualified(sha256) {
  return artifacts.has(sha256);
}
export function hwp5VerticalMarginsBackendQualified(module) {
  return qualifiedBackendModules.has(module);
}
async function verifiedArtifact(input) {
  if (!(input instanceof Uint8Array) || !allowedLengths.has(byteLength.call(input)))
    throw Error('InvalidHwp5VerticalMarginsArtifact');
  const owned = new Uint8Array(input);
  if (!globalThis.crypto?.subtle) throw Error('Hwp5VerticalMarginsDigestUnavailable');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned));
  const sha256 = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  if (artifacts.get(sha256) !== owned.length) throw Error('UnqualifiedHwp5VerticalMarginsArtifact');
  return { owned, sha256 };
}
/** Returned bytes are owned; callers cannot mutate any previously issued module proof. */
export async function verifiedHwp5VerticalMarginsBytes(input) {
  return (await verifiedArtifact(input)).owned;
}
export async function compileHwp5VerticalMarginsModule(input) {
  const { owned, sha256 } = await verifiedArtifact(input);
  const previous = compilations.get(sha256);
  if (previous) return previous;
  const pending = compileWasm(owned).then((module) => {
    if (!(module instanceof Module)) throw Error('InvalidHwp5VerticalMarginsModule');
    qualifiedBackendModules.set(module, owned);
    return module;
  });
  compilations.set(sha256, pending);
  void pending.catch(() => {
    if (compilations.get(sha256) === pending) compilations.delete(sha256);
  });
  return pending;
}
/** Structured-clone loses the proof. Worker receives owned bytes and re-verifies/recompiles,
 * never a caller-supplied hash, enabled flag, or a purported Module-to-bytes association. */
export function copyHwp5VerticalMarginsModuleBytes(module) {
  const bytes = qualifiedBackendModules.get(module);
  return bytes ? new Uint8Array(bytes) : undefined;
}
