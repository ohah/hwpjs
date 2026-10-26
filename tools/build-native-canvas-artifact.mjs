import {
  readFileSync as rawRead,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  statfsSync,
  copyFileSync,
} from 'node:fs';
import { resolve, join, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fail = (ok, message) => {
  if (!ok) throw Error(message);
};
const blocked = (n) => /title-column-roundtrip|hwpers/i.test(n);
const readFileSync = (path, ...args) => {
  fail(typeof path === 'string' && !blocked(path), 'ProtectedOrInvalidPath');
  return rawRead(path, ...args);
};
function file(root, name) {
  fail(typeof name === 'string' && !blocked(name), 'ProtectedOrInvalidPath');
  fail(!isAbsolute(name) && !name.split(/[\\/]/).includes('..'), 'SourcePathEscape');
  const path = realpathSync(join(root, name));
  fail(path.startsWith(root + '/'), 'SourcePathEscape');
  return path;
}
export function validateRequest(request) {
  fail([1, 2].includes(request?.schemaVersion), 'InvalidArtifactRequest');
  const v2 = request.schemaVersion === 2;
  let toolchain = null;
  if (v2) {
    fail(!request.reuse, 'NativeV2FreshArchiveRequired');
    fail(request.historyProtocol === 'hwpjs.native-history/2', 'NativeHistoryProtocolMismatch');
    fail(
      /^[a-f0-9]{64}$/.test(request.sourceOverlayManifestSHA256) &&
        /^[a-f0-9]{64}$/.test(request.nativeClosureSHA256),
      'NativeV2OverlayProofRequired',
    );
    fail(
      sha(readFileSync(request.sourceOverlayManifest)) === request.sourceOverlayManifestSHA256 &&
        sha(readFileSync(request.nativeClosureManifest)) === request.nativeClosureSHA256,
      'NativeV2OverlayProofMismatch',
    );
  }
  fail(request.target === 'aarch64-ios.17.0-simulator', 'UnsupportedNativeTarget');
  fail(/^[a-f0-9]{40}$/.test(request.revision), 'InvalidSourceRevision');
  const keys = ['HWPJS_NATIVE_SHARED_SNAPSHOT', 'HWPJS_NATIVE_RENDER_SOURCES'];
  if (v2) keys.push('HWPJS_NATIVE_HISTORY_V2');
  fail(
    request.bridgeFlags &&
      Object.keys(request.bridgeFlags).length === keys.length &&
      keys.every(
        (k) => Number.isInteger(request.bridgeFlags[k]) && [0, 1].includes(request.bridgeFlags[k]),
      ),
    'InvalidNativeCapabilityFlag',
  );
  fail(
    typeof request.sourceRoot === 'string' && !blocked(request.sourceRoot),
    'ProtectedOrInvalidPath',
  );
  const root = realpathSync(request.sourceRoot);
  fail(Array.isArray(request.sources) && request.sources.length > 0, 'NativeSourceClosureRequired');
  const seen = new Set();
  for (const r of request.sources) {
    fail(r && typeof r.path === 'string' && !seen.has(r.path), 'DuplicateSourcePath');
    seen.add(r.path);
    fail(r.path.startsWith('src/'), 'NonNativeSource');
    fail(/^[a-f0-9]{64}$/.test(r.sha256), 'InvalidSourceHash');
    fail(sha(readFileSync(file(root, r.path))) === r.sha256, 'NativeSourceMismatch');
  }
  fail(seen.has('src/native_hermes_probe.zig'), 'NativeEntryMissing');
  if (v2) {
    fail(
      sha(readFileSync(request.toolchainManifest)) === request.toolchainManifestSHA256,
      'NativeToolchainProofMismatch',
    );
    toolchain = JSON.parse(readFileSync(request.toolchainManifest));
    fail(
      sha(readFileSync(toolchain.compilerPath)) === toolchain.compilerSHA256 &&
        toolchain.zigLibRoot === request.zigLibDir,
      'NativeCompilerMismatch',
    );
    for (const row of toolchain.files) {
      fail(
        typeof row.path === 'string' &&
          !blocked(row.path) &&
          !isAbsolute(row.path) &&
          !row.path.split(/[\\/]/).includes('..'),
        'ProtectedOrInvalidPath',
      );
      const path = join(request.zigLibDir, row.path);
      const resolved = realpathSync(path);
      const allowed = [
        realpathSync(request.zigLibDir),
        join(dirname(toolchain.compilerPath), 'lib'),
      ];
      fail(
        resolved === row.resolvedPath && allowed.some((root) => resolved.startsWith(root + '/')),
        'NativeToolchainPathMismatch',
      );
      fail(sha(readFileSync(path)) === row.sha256, 'NativeZigLibraryMismatch');
    }
    fail(
      toolchain.sdkPath === request.sdkPath &&
        sha(readFileSync(join(request.sdkPath, 'SDKSettings.json'))) ===
          toolchain.SDKSettingsSHA256,
      'NativeSDKMismatch',
    );
  }

  if (v2) {
    const closure = JSON.parse(readFileSync(request.nativeClosureManifest));
    const canonical = (rows) => JSON.stringify(rows.map((row) => [row.path, row.sha256]).sort());
    fail(canonical(closure.files) === canonical(request.sources), 'NativeV2ClosureMismatch');
    const overlay = JSON.parse(readFileSync(request.sourceOverlayManifest));
    for (const row of overlay.files)
      fail(
        sha(readFileSync(file(root, row.path))) === row.afterSHA256,
        'NativeV2OverlaySourceMismatch',
      );
  }
  for (const r of request.sources) {
    const text = readFileSync(file(root, r.path), 'utf8');
    for (const match of text.matchAll(/@(import|embedFile)\(\s*"([^"\n]+)"\s*\)/g)) {
      if (match[1] === 'import' && ['std', 'builtin'].includes(match[2])) continue;
      const normalized = resolve(root, dirname(r.path), match[2]).slice(root.length + 1);
      fail(seen.has(normalized), 'NativeLiteralDependencyMissing:' + normalized);
    }
  }
  fail(
    request.headers &&
      JSON.stringify(Object.keys(request.headers).sort()) ===
        JSON.stringify(['NativeCanvasAbi.h', 'hwp_native.h']),
    'InvalidNativeHeaders',
  );
  for (const name of ['hwp_native.h', 'NativeCanvasAbi.h']) {
    const h = request.headers?.[name];
    fail(h && sha(readFileSync(file(root, h.path))) === h.sha256, 'NativeHeaderMismatch');
  }
  const declared = [
    ...new Set(
      Object.values(request.headers).flatMap((h) =>
        [
          ...readFileSync(file(root, h.path), 'utf8').matchAll(
            /HwpNativeStatus (hwp_native_\w+)\(/g,
          ),
        ].map((x) => x[1]),
      ),
    ),
  ].sort();
  const abi = readFileSync(file(root, 'src/native/abi.zig'), 'utf8');
  const names = [...abi.matchAll(/pub export fn (hwp_native_\w+)\(/g)].map((x) => x[1]).sort();
  fail(
    names.length === (v2 ? 21 : 19) &&
      new Set(names).size === names.length &&
      JSON.stringify(names) === JSON.stringify(declared),
    'NativeExportContractMismatch',
  );
  if (v2)
    fail(
      names.includes('hwp_native_history_stats_v2') &&
        names.includes('hwp_native_history_configure_v2'),
      'NativeHistoryExportsMissing',
    );
  return {
    root,
    names,
    toolchain,
    fingerprint: sha(
      Buffer.from(
        JSON.stringify(request.sources.slice().sort((a, b) => a.path.localeCompare(b.path))),
      ),
    ),
    definitions: keys.filter((k) => request.bridgeFlags[k] === 1).map((k) => k + '=1'),
  };
}
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
  fail(r.status === 0, 'NativeToolFailed:' + cmd + ':' + r.stderr);
  return r.stdout;
}
export function inspectArchive(path, expectedSHA, names) {
  fail(!blocked(path), 'ProtectedOrInvalidPath');
  const bytes = readFileSync(path);
  fail(sha(bytes) === expectedSHA, 'NativeArchiveHashMismatch');
  fail(bytes.subarray(0, 8).toString() === '!<arch>\n', 'NativeArchiveMagicMismatch');
  const headers = run('xcrun', ['otool', '-hv', path]),
    load = run('xcrun', ['otool', '-l', path]),
    nm = run('xcrun', ['nm', '-gU', path]);
  fail(headers.includes('ARM64'), 'NativeArchitectureMismatch');
  fail(/platform\s+7\b/.test(load) && /minos\s+17\.0\b/.test(load), 'NativePlatformMismatch');
  const exports = [
    ...new Set([...nm.matchAll(/\bT _?(hwp_native_\w+)\b/g)].map((x) => x[1])),
  ].sort();
  fail(JSON.stringify(exports) === JSON.stringify(names), 'NativeBinaryExportsMismatch');
  return { sha256: sha(bytes), bytes: bytes.length, exports, headers, load, nm };
}
export async function produce(request, out) {
  fail(typeof out === 'string' && !blocked(out), 'ProtectedOrInvalidPath');
  const v = validateRequest(request);
  fail(!resolve(out).startsWith(v.root + '/'), 'ArtifactOutputInsideSource');
  fail(!existsSync(out), 'FreshArtifactOutputRequired');
  const initialDisk = statfsSync(out.slice(0, out.lastIndexOf('/')));
  fail(initialDisk.bavail * initialDisk.bsize >= 5 * 1024 ** 3, 'NativeDiskGuard');
  const memory = run('memory_pressure', []);
  const free = Number(/System-wide memory free percentage:\s*(\d+)/.exec(memory)?.[1]);
  fail(free >= 35, 'NativeMemoryGuard');
  const generator = request.headerGenerator;
  fail(
    generator && sha(readFileSync(file(v.root, generator.path))) === generator.sha256,
    'HeaderGeneratorMismatch',
  );
  const { generateCanvasHeader } = await import(pathToFileURL(file(v.root, generator.path)).href);
  fail(
    generateCanvasHeader(
      readFileSync(file(v.root, 'src/native/abi_contract.zig'), 'utf8'),
      readFileSync(file(v.root, 'src/native/abi.zig'), 'utf8'),
    ) === readFileSync(file(v.root, request.headers['NativeCanvasAbi.h'].path), 'utf8'),
    'GeneratedHeaderMismatch',
  );
  let input, origin;
  if (request.reuse) {
    const receipt = JSON.parse(readFileSync(request.reuse.buildReceipt));
    fail(
      sha(readFileSync(request.reuse.buildReceipt)) === request.reuse.buildReceiptSHA256,
      'OriginalBuildReceiptMismatch',
    );
    fail(
      receipt.archiveSHA256 === request.reuse.sha256 &&
        receipt.exportCount === 19 &&
        receipt.platform === 'ios-simulator',
      'OriginalBuildProofMismatch',
    );
    const execution = JSON.parse(readFileSync(request.reuse.executionReceipt));
    fail(
      sha(readFileSync(request.reuse.executionReceipt)) === request.reuse.executionReceiptSHA256 &&
        execution.exit === 0 &&
        execution.archiveSHA256 === request.reuse.sha256 &&
        execution.sourceDrift?.length === 0,
      'OriginalExecutionProofMismatch',
    );
    const old = JSON.parse(readFileSync(request.reuse.sourceManifest));
    fail(
      execution.sourceFingerprint === old.sourceFingerprint,
      'OriginalSourceFingerprintMismatch',
    );
    fail(
      sha(readFileSync(request.reuse.sourceManifest)) === request.reuse.sourceManifestSHA256,
      'OriginalSourceManifestMismatch',
    );
    const oldSources = old.files
      .filter((r) => r.path.startsWith('src/'))
      .map((r) => [r.path, r.sha256])
      .sort();
    fail(
      JSON.stringify(oldSources) ===
        JSON.stringify(request.sources.map((r) => [r.path, r.sha256]).sort()),
      'ReuseNativeSourceMismatch',
    );
    input = request.reuse.archive;
    origin = {
      mode: 'verified-code-identical-reuse',
      originalBuildReceiptSHA256: request.reuse.buildReceiptSHA256,
      originalExecutionReceiptSHA256: request.reuse.executionReceiptSHA256,
      newZigCompile: false,
      bridgeCPPNotInherited: true,
    };
  } else {
    fail(request.sdkPath && request.zigLibDir, 'NativeToolchainRequired');
    mkdirSync(join(out, 'cache/local'), { recursive: true });
    mkdirSync(join(out, 'cache/global'), { recursive: true });
    input = join(out, 'archive-built.a');
    const args = [
      '-n19',
      ...(request.schemaVersion === 2 ? [v.toolchain.compilerPath] : ['mise', 'exec', '--', 'zig']),
      'build-lib',
      'src/native_hermes_probe.zig',
      '-j1',
      '-O',
      'ReleaseSafe',
      '-static',
      '-fPIC',
      '-lc',
      '-target',
      request.target,
      '--sysroot',
      request.sdkPath,
      '-L',
      join(request.sdkPath, 'usr/lib'),
      '--zig-lib-dir',
      request.zigLibDir,
      '--cache-dir',
      join(out, 'cache/local'),
      '--global-cache-dir',
      join(out, 'cache/global'),
      '-femit-bin=' + input,
    ];
    const samples = [];
    let guardFailure = null;
    const code = await new Promise((complete, reject) => {
      const child = spawn('nice', args, { cwd: v.root });
      let log = '';
      child.stdout.on('data', (value) => {
        log += value;
      });
      child.stderr.on('data', (value) => {
        log += value;
      });
      const timer = setInterval(() => {
        try {
          const text = run('memory_pressure', []);
          const freePercent = Number(/System-wide memory free percentage:\s*(\d+)/.exec(text)?.[1]);
          const disk = statfsSync(out);
          const diskFreeBytes = disk.bavail * disk.bsize;
          samples.push({ at: Date.now(), freePercent, diskFreeBytes });
          if (!(freePercent >= 35) || diskFreeBytes < 5 * 1024 ** 3) {
            guardFailure = 'NativeResourceGuard';
            child.kill('SIGINT');
          }
        } catch (error) {
          guardFailure = String(error);
          child.kill('SIGINT');
        }
      }, 5000);
      child.once('error', (error) => {
        clearInterval(timer);
        reject(error);
      });
      child.once('close', (value) => {
        clearInterval(timer);
        writeFileSync(join(out, 'archive-build.log'), log);
        complete(value);
      });
      writeFileSync(
        join(out, 'ARCHIVE-START.json'),
        JSON.stringify(
          { wrapperPID: process.pid, childPID: child.pid, argv: ['nice', ...args] },
          null,
          2,
        ),
      );
    });
    writeFileSync(join(out, 'ARCHIVE-MEMORY.json'), JSON.stringify(samples, null, 2));
    fail(!guardFailure && code === 0, 'NativeArchiveBuildFailed:' + (guardFailure ?? code));
    origin = {
      mode: 'fresh-archive',
      argv: ['nice', ...args],
      exit: code,
      newZigCompile: true,
    };
  }
  const expected = request.reuse?.sha256 ?? sha(readFileSync(input));
  const binary = inspectArchive(input, expected, v.names);
  mkdirSync(join(out, 'archive'), { recursive: true });
  mkdirSync(join(out, 'headers'), { recursive: true });
  const archive = 'archive/libhwp_native_canvas.a';
  copyFileSync(input, join(out, archive));
  const headers = {},
    files = [{ path: archive, sha256: binary.sha256 }];
  for (const [name, h] of Object.entries(request.headers)) {
    const n = 'headers/' + name;
    copyFileSync(file(v.root, h.path), join(out, n));
    headers[name] = n;
    files.push({ path: n, sha256: h.sha256 });
  }
  const receipt = {
    schemaVersion: 1,
    profile: 'hwpjs.native-canvas/1',
    abiVersion: 1,
    platform: 'ios-simulator',
    architecture: 'arm64',
    source: {
      revision: request.revision,
      fingerprint: v.fingerprint,
      overlayManifestSHA256: request.sourceOverlayManifestSHA256,
      toolchainManifestSHA256: request.toolchainManifestSHA256,
      closureManifestSHA256: request.nativeClosureSHA256,
    },
    archive: { path: archive },
    headers,
    files,
    bridgeFlags: request.bridgeFlags,
    historyProtocol: request.schemaVersion === 2 ? request.historyProtocol : null,
    proof: {
      archive: origin,
      requestedCPPDefinitions: v.definitions,
      CPPBuild: 'not-executed',
      simulator: 'not-executed',
      backendCABIExports: v.names.length,
      backendFunctionsRemainAvailable: true,
    },
  };
  writeFileSync(join(out, 'native-artifacts.json'), JSON.stringify(receipt, null, 2) + '\n');
  writeFileSync(
    join(out, 'BINARY-VERIFIED.json'),
    JSON.stringify({ ...binary, origin, requestedBridgeFlags: request.bridgeFlags }, null, 2) +
      '\n',
  );
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [request, out] = process.argv.slice(2);
  fail(request && out, 'UsageRequestAndFreshOutput');
  produce(JSON.parse(readFileSync(request)), resolve(out))
    .then((x) => console.log(JSON.stringify({ archive: x.files[0], bridgeFlags: x.bridgeFlags })))
    .catch((e) => {
      console.error(e.stack);
      process.exitCode = 1;
    });
}
