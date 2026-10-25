import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, readdir, copyFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { stripWasmDebug } from './wasm-runtime-parity.mjs';

assert(globalThis.Bun, "BuildRequiresBun");
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2), options = {};
for (const argument of args) {
  if (argument === "--web") { assert(!options.web, "DuplicateBuildArgument"); options.web = true; }
  else {
    const match = /^--(wasm|package)=(.+)$/.exec(argument);
    assert(match && !Object.hasOwn(options, match[1]), "InvalidBuildArgument"); options[match[1]] = match[2];
  }
}
const order = ["core", "vanilla", "react", "svelte", ...(options.web ? [] : ["react-native"])];
assert(!options.package || order.includes(options.package), "UnknownPackage");
const selected = options.package ? [options.package] : order;
const artifact = options.wasm ?? process.env.HWPJS_BUILD_WASM;
if (selected.includes("core")) assert(artifact, "ExplicitBuildWasmRequired: use --wasm=/absolute/path/hwpjs.wasm");
const outputRoot = resolve(root, "zig-out/package-build");
await mkdir(outputRoot, { recursive: true });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function sveltePlugin(generate) {
  return { name: `hwpjs-svelte-${generate}`, setup(builder) {
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const { compile } = await import('svelte/compiler');
      const result = compile(await readFile(path, 'utf8'), { filename: path, generate, dev: false });
      return { contents: result.js.code, loader: 'js' };
    });
  } };
}
async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await files(path));
    else if (item.isFile()) result.push(path);
    else throw Error(`UnexpectedBuildInput:${path}`);
  }
  return result.sort();
}
async function fingerprints(paths) { return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(path))]))); }
const built = [];
for (const name of selected) {
  const directory = resolve(root, "packages", name), source = join(directory, "src");
  const entries = name === "core" ? ["index.ts", "runtime.ts", "worker.ts"] : ["index.ts"];
  for (const entry of entries) assert(existsSync(join(source, entry)), `MissingPackageEntrypoint:${name}/${entry}`);
  if (name === "react-native") {
    assert(existsSync(join(directory, "native-artifacts.json")), "NativeArtifactsRequired: JS bundle alone is not a React Native build");
    const native = JSON.parse(await readFile(join(directory, "native-artifacts.json"), "utf8"));
    assert(Array.isArray(native.files) && native.files.length, "InvalidNativeArtifactManifest");
    for (const item of native.files) {
      const path = resolve(directory, item.path);
      assert(path.startsWith(directory + "/") && sha(await readFile(path)) === item.sha256, "NativeArtifactMismatch");
    }
  }
  const legacy = name === "core" ? [...await files(join(root, "js")), ...await files(join(root, "web/preview"))]
    .filter(path => /\.(?:mjs|ts|mts|html|css)$/.test(path)) : [];
  const buildInputs = ['tools/build-packages.mjs', 'tools/wasm-runtime-parity.mjs', 'tsconfig.json',
    'package.json', 'bun.lock', '.mise.toml', 'LICENSE', 'docs/third-party-notices.md'].map(path => join(root, path));
  const inputs = [...await files(source), ...legacy, ...buildInputs, join(directory, "package.json")].sort();
  const before = await fingerprints(inputs), staging = await mkdtemp(join(outputRoot, `${name}-`));
  const result = await Bun.build({
    entrypoints: entries.map(entry => join(source, entry)), outdir: staging,
    root: source, target: "browser", format: "esm", splitting: true, sourcemap: "external",
    naming: { entry: "[name].js", chunk: "[name]-[hash].js", asset: "assets/[name]-[hash].[ext]" },
    plugins: name === 'svelte' ? [sveltePlugin('client')] : [],
    external: ["@hwpjs/*", "react", "react/*", "react-dom", "react-dom/*", "svelte", "svelte/*", "react-native", "react-native/*", "@shopify/react-native-skia"],
  });
  assert(result.success, result.logs.map(String).join("\n"));
  if (name === 'svelte') {
    const server = await Bun.build({ entrypoints: [join(source, 'index.ts')], outdir: staging,
      target: 'node', format: 'esm', naming: 'index.server.js', plugins: [sveltePlugin('server')],
      external: ['@hwpjs/*', 'svelte', 'svelte/*'] });
    assert(server.success, server.logs.map(String).join('\n'));
  }
  const config = join(outputRoot, basename(staging) + ".tsconfig.json");
  await writeFile(config, JSON.stringify({
    extends: resolve(root, "tsconfig.json"),
    compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true, noEmitOnError: true,
      rootDir: source, outDir: staging, allowImportingTsExtensions: true, rewriteRelativeImportExtensions: true },
    include: [source + "/**/*.ts", source + "/**/*.tsx", source + "/**/*.d.ts"], exclude: [],
  }));
  const declaration = spawnSync(process.execPath, ["x", "tsc", "--project", config], { cwd: root, stdio: "inherit" });
  assert(declaration.status === 0, `DeclarationBuildFailed:${name}`);
  for (const path of await files(source)) if (path.endsWith('.svelte.d.ts')) {
    const target = join(staging, relative(source, path));
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, (await readFile(path, 'utf8')).replaceAll(".ts'", ".js'").replaceAll('.ts"', '.js"'));
  }
  if (name === "core") {
    const input = await readFile(resolve(root, artifact));
    assert(input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])), "InvalidBuildWasm");
    const bytes = stripWasmDebug(input);
    await writeFile(join(staging, "hwpjs.wasm"), bytes);
    await writeFile(join(staging, "wasm-artifact.json"), JSON.stringify({ sha256: sha(bytes), bytes: bytes.length,
      sourceSha256: sha(input), sourceBytes: input.length, debugBytesRemoved: input.length - bytes.length,
      identicalRuntime: true }));
  }
  await copyFile(join(root, "LICENSE"), join(directory, "LICENSE"));
  await copyFile(join(root, "docs/third-party-notices.md"), join(directory, "THIRD_PARTY_NOTICES.md"));
  assert.deepEqual(await fingerprints(inputs), before, `BuildSourcesChanged:${name}`);
  const manifest = Object.fromEntries((await Promise.all((await files(staging))
    .map(async path => [relative(staging, path), sha(await readFile(path))]))).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(join(outputRoot, basename(staging) + ".sources.json"), JSON.stringify(before));
  await writeFile(join(staging, "build-manifest.json"), JSON.stringify({ package: name, sourceFingerprint: sha(JSON.stringify(before)), files: manifest }));
  const destination = join(directory, "dist");
  if (existsSync(destination)) await rename(destination, await mkdtemp(join(outputRoot, `${name}-previous-`)) + "/dist");
  await rename(staging, destination);
  built.push(name);
  console.log(JSON.stringify({ kind: "package-built", name, directory: relative(root, destination), files: Object.keys(manifest).length }));
}
console.log(JSON.stringify({ kind: "package-build-summary", built, scope: options.web ? "web packages only; React Native not built" : "package build; native/device E2E is a separate gate" }));
