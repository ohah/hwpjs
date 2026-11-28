// Exact low-level-qualified engine only. Hash lookup is metadata, never module authority.
// The only issuer compiles an owned copy of these exact bytes. No registration API.
const artifacts = new Map([
  ['e8c4676c862dd8cdc59acb6c3b0658d7100b0e5d1ecc592e9095729b64f419a5', 5577426],
  ['d252ac5a853fdd185aa31ee5445f985d358a04be0c0dcee1be527ae49f8929a9', 5577841],
  ['1600ead7c4bc75f9094901b44464678790cb9e41fc6d972532bbbeab17c247b7', 5593551],
  ['16d0a7c9109c511a4f17dcd050dd69c1537979f98c090cf7e437b06908b87a35', 5596000],
  ['27cfcdf7f0df6553dee30f87e41360839986f08f4e51d66d7d5143f4ac25049c', 5618104],
  ['450dfba8b9733637c2cb47766a4d1d41e3ef96c79251309e51a946f297041878', 5624258],
  ['1abb11ee1f1b91553479cde3e6713628fbc4dc91b60bc7eacffa92ad104ecc50', 5672476],
  ['773e3f117c141464cd069e8915e6e02d15604eebd04f36483a903c02337fde9a', 5699237],
  ['858c1dac8c9fda5e28d9eb2a5b50ac07be731d5963937a153b9a89dc667d7dcc', 5699361],
  ['5f98f685e8017159588169739febb13760b8439ccb21b2d1d08e64f88b0ab077', 5699849],
  ['5da71f4d77c562fb37b5fef09aa7f3cf1ec30ac4bfd768ff27727105a976e740', 5701025],
  ['f883b39b14f9c9580cc58e182f7a9ddc2a05bd5c6aa283da0472c8e378c3b463', 5701115],
  ['3ab19ae617ee840acef3bcbc5043f0a7447cb2b7fd1a89ddae78e7b62c11165f', 5766251],
  ['986f3f685a6b68a2c570a28e806f13fa455a5c7e4bac4357a86815f344677b00', 5782223],
  ['1ba4881f8a97d92ff3480040db33c17e95626a2a6bd0407f45544f2138415372', 5824956],
  ['ca7d4a01760c9ad6c7ac148d7a41aea8837690520745d2d18d9c3f682f123ae9', 5834384],
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
