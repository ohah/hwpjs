// Exact low-level-qualified engine only. Hash lookup is metadata, never module authority.
// The only issuer compiles an owned copy of these exact bytes. No registration API.
const artifactSHA256 = 'e8c4676c862dd8cdc59acb6c3b0658d7100b0e5d1ecc592e9095729b64f419a5';
const artifactBytes = 5577426;
const qualifiedBackendModules = new WeakMap();
const compileWasm = WebAssembly.compile.bind(WebAssembly);
const Module = WebAssembly.Module;
const byteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength',
).get;
let compilation;
export function hwp5VerticalMarginsArtifactQualified(sha256) {
  return sha256 === artifactSHA256;
}
export function hwp5VerticalMarginsBackendQualified(module) {
  return qualifiedBackendModules.has(module);
}
/** Returned bytes are owned; callers cannot mutate any previously issued module proof. */
export async function verifiedHwp5VerticalMarginsBytes(input) {
  if (!(input instanceof Uint8Array) || byteLength.call(input) !== artifactBytes)
    throw Error('InvalidHwp5VerticalMarginsArtifact');
  const owned = new Uint8Array(input);
  if (!globalThis.crypto?.subtle) throw Error('Hwp5VerticalMarginsDigestUnavailable');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned));
  const sha256 = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  if (sha256 !== artifactSHA256) throw Error('UnqualifiedHwp5VerticalMarginsArtifact');
  return owned;
}
export async function compileHwp5VerticalMarginsModule(input) {
  const owned = await verifiedHwp5VerticalMarginsBytes(input);
  if (compilation) return compilation;
  const pending = compileWasm(owned).then((module) => {
    if (!(module instanceof Module)) throw Error('InvalidHwp5VerticalMarginsModule');
    qualifiedBackendModules.set(module, owned);
    return module;
  });
  compilation = pending;
  void pending.catch(() => {
    if (compilation === pending) compilation = undefined;
  });
  return pending;
}
/** Structured-clone loses the proof. Worker receives owned bytes and re-verifies/recompiles,
 * never a caller-supplied hash, enabled flag, or a purported Module-to-bytes association. */
export function copyHwp5VerticalMarginsModuleBytes(module) {
  const bytes = qualifiedBackendModules.get(module);
  return bytes ? new Uint8Array(bytes) : undefined;
}
