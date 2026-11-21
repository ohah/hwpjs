#!/usr/bin/env node
// Own blank documents only. This producer never writes gallery/source paths.
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const equal = (left, right) => Buffer.from(left).equals(Buffer.from(right));
export async function produceBlankImageFixtures({ sdkRoot, bindingPath, sourceReceipt, out }) {
  const sdk = await realpath(sdkRoot),
    destination = resolve(out);
  const project = fileURLToPath(new URL('../../', import.meta.url));
  if (
    destination === project ||
    destination.startsWith(project + sep) ||
    destination === sdk ||
    destination.startsWith(sdk + sep)
  )
    throw Error('PrivateOutputRequired');
  const parent = await realpath(resolve(destination, '..'));
  if (resolve(parent, destination.split(sep).at(-1)) !== destination)
    throw Error('OutputSymlinkAncestor');
  try {
    await lstat(destination);
    throw Error('OutputAlreadyExists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const binding = JSON.parse(await readFile(bindingPath, 'utf8'));
  const originBytes = await readFile(sourceReceipt),
    origin = JSON.parse(originBytes);
  if (
    origin.tree !== binding.sourceTree ||
    origin.passed !== true ||
    sha(originBytes) !== binding.sourceReceiptSHA256
  )
    throw Error('UnqualifiedSourceReceipt');
  const dist = resolve(sdk, 'dist'),
    manifestBytes = await readFile(resolve(dist, 'build-manifest.json'));
  if (sha(manifestBytes) !== binding.sdkBuildManifestSHA256) throw Error('SdkManifestMismatch');
  const manifest = JSON.parse(manifestBytes);
  if (manifest.namespace !== '@ohah/hwpjs' || manifest.wasm.sha256 !== binding.wasmSHA256)
    throw Error('SdkEngineMismatch');
  for (const [path, digest] of Object.entries(manifest.files)) {
    const file = resolve(dist, path);
    if (
      !file.startsWith(dist + sep) ||
      (await realpath(file)) !== file ||
      sha(await readFile(file)) !== digest
    )
      throw Error('SdkFileMismatch:' + path);
  }
  const wasmPath = resolve(dist, 'hwpjs.wasm'),
    wasm = await readFile(wasmPath);
  if (sha(wasm) !== binding.wasmSHA256) throw Error('WasmMismatch');
  const core = await import(pathToFileURL(resolve(dist, 'index.js')).href);
  const runtime = await import(pathToFileURL(resolve(dist, 'runtime.js')).href);
  const loadWasmModule = runtime.createWasmModuleLoader({
    url: pathToFileURL(wasmPath),
    // The host supplies exactly the pinned local bytes; no network fetch.
    fetch: async () =>
      new Response(wasm.slice(), { headers: { 'Content-Type': 'application/wasm' } }),
  });
  const createEditor = () =>
    core.createEditor({ runtimeFactory: runtime.createReaderRuntimeFactory({ loadWasmModule }) });
  const artifacts = [],
    pending = [];
  for (const [format, name] of [
    ['hwp5', 'image-insert-blank.hwp'],
    ['hwpx', 'image-insert-blank.hwpx'],
  ]) {
    const runs = [];
    for (let run = 0; run < 2; run++) {
      const editor = createEditor();
      try {
        await editor.createDocument({ format });
        const saved = await editor.save(); // Real default policy, no stale/recovery consent.
        if (saved.format !== format || saved.staleSnapshot) throw Error('InvalidBlankSave');
        runs.push(saved.bytes.slice());
      } finally {
        await editor.dispose();
      }
    }
    if (!equal(runs[0], runs[1])) throw Error('NonDeterministicBlank:' + format);
    const fresh = createEditor();
    try {
      await fresh.load(runs[0], { format });
      const saved = await fresh.save();
      if (saved.format !== format || saved.staleSnapshot || !equal(saved.bytes, runs[0]))
        throw Error('ReopenChangedBlank:' + format);
    } finally {
      await fresh.dispose();
    }
    artifacts.push({
      id: name,
      format,
      bytes: runs[0].length,
      sha256: sha(runs[0]),
      repeatedBytesEqual: true,
      freshSdkReopenDefaultSaveEqual: true,
      saveOptions: {},
    });
    pending.push([name, runs[0]]);
  }
  // Recheck all SDK inputs after runtime use; publish only fully checked results.
  for (const [path, digest] of Object.entries(manifest.files))
    if (sha(await readFile(resolve(dist, path))) !== digest)
      throw Error('SdkPostPinMismatch:' + path);
  const receipt = {
    schemaVersion: 1,
    sourceTree: binding.sourceTree,
    sdkBuildManifestSHA256: sha(manifestBytes),
    sourceReceiptSHA256: sha(originBytes),
    wasmSHA256: sha(wasm),
    producerSHA256: sha(await readFile(fileURLToPath(import.meta.url))),
    artifacts,
    SDKOnly: true,
    NativeBuilds: 0,
    browserRuns: 0,
    externalContent: false,
    embeddedFontBytes: false,
    baselineStaleConsent: false,
  };
  await mkdir(destination);
  for (const [name, bytes] of pending)
    await writeFile(resolve(destination, name), bytes, { flag: 'wx', mode: 0o444 });
  await writeFile(
    resolve(destination, 'producer-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx', mode: 0o444 },
  );
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2),
      options = new Map();
    if (args.length !== 8) throw Error('ExplicitInputsRequired');
    for (let i = 0; i < args.length; i += 2) {
      if (
        !['--sdk-root', '--binding', '--source-receipt', '--out'].includes(args[i]) ||
        options.has(args[i])
      )
        throw Error('InvalidOption');
      options.set(args[i], args[i + 1]);
    }
    const receipt = await produceBlankImageFixtures({
      sdkRoot: options.get('--sdk-root'),
      bindingPath: options.get('--binding'),
      sourceReceipt: options.get('--source-receipt'),
      out: options.get('--out'),
    });
    console.log(JSON.stringify(receipt));
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}
