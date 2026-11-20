// CI execution is explicit. Importing this module never launches a compiler.
import assert from 'node:assert/strict';
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
  realpath,
  chmod,
  statfs,
  readlink,
  lstat,
  open,
  unlink,
} from 'node:fs/promises';
import { resolve, dirname, join, relative, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { constants, openSync, writeSync, closeSync } from 'node:fs';
import {
  documentSearchTargets,
  nativeSearchResults,
  digest,
} from './document-search-native-registration.mjs';
const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedTop = new Set([
  'src',
  'tests',
  'tools',
  'js',
  'web',
  'packages',
  'apps',
  'docs',
  '.github',
]);
// Only these committed own public aliases may become regular snapshot files.
const sourceAliases = Object.freeze({
  'src/testing/noori-column/noori.hwp': Object.freeze({
    link: '../../../apps/docs/docs/public/editor/fixtures/noori.hwp',
    target: 'apps/docs/docs/public/editor/fixtures/noori.hwp',
    bytes: 257536,
    sha256: 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
  }),
  'src/testing/noori-column/noori.hwpx': Object.freeze({
    link: '../../../apps/docs/docs/public/editor/fixtures/noori.hwpx',
    target: 'apps/docs/docs/public/editor/fixtures/noori.hwpx',
    bytes: 324413,
    sha256: '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
  }),
});
async function ownAliasBytes(root, path) {
  const pin = Object.hasOwn(sourceAliases, path) ? sourceAliases[path] : null;
  assert(pin, 'UnexpectedSnapshotSymlink:' + path);
  const alias = join(root, path),
    literal = await readlink(alias);
  assert.equal(literal, pin.link, 'SnapshotAliasLiteralMismatch:' + path);
  const canonicalRoot = await realpath(root),
    target = join(canonicalRoot, pin.target);
  assert.equal(await realpath(alias), target, 'SnapshotAliasTargetMismatch:' + path);
  // Refuse symlink ancestors and terminal links before opening any target data.
  let at = canonicalRoot;
  for (const part of pin.target.split('/')) {
    at = join(at, part);
    const metadata = await lstat(at);
    assert(!metadata.isSymbolicLink(), 'SnapshotAliasPhysicalSymlink:' + path);
    assert(
      at === target ? metadata.isFile() : metadata.isDirectory(),
      'SnapshotAliasPhysicalType:' + path,
    );
  }
  const before = await lstat(target);
  assert.equal(before.size, pin.bytes, 'SnapshotAliasSizeMismatch:' + path);
  assert.equal(typeof constants.O_NOFOLLOW, 'number', 'SnapshotNoFollowUnavailable');
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const opened = await handle.stat();
    assert(
      opened.isFile() && opened.dev === before.dev && opened.ino === before.ino,
      'SnapshotAliasIdentityChanged:' + path,
    );
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  assert.equal(bytes.length, pin.bytes, 'SnapshotAliasSizeMismatch:' + path);
  assert.equal(digest(bytes), pin.sha256, 'SnapshotAliasDigestMismatch:' + path);
  assert.equal(await readlink(alias), literal, 'SnapshotAliasChanged:' + path);
  return {
    bytes,
    evidence: {
      path,
      link: literal,
      target: pin.target,
      bytes: bytes.length,
      sha256: pin.sha256,
      physicalRegularTarget: true,
    },
  };
}
function forbidden(path) {
  return (
    path === 'tests/hwpx/title-column-roundtrip.test.mjs' ||
    path.startsWith('legacy/hwpers/') ||
    basename(path) === 'hwpers_test4_complex_table.hwp'
  );
}
async function files(root, prefix = '', compiler = false, verifiedAliases = null) {
  const rows = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (
      !compiler &&
      ((!prefix &&
        !allowedTop.has(entry.name) &&
        !['build.zig', 'package.json', 'bun.lock', 'tsconfig.json', 'LICENSE'].includes(
          entry.name,
        )) ||
        ['node_modules', '.git', 'zig-out', 'dist', 'public', 'legacy'].includes(entry.name) ||
        forbidden(path))
    )
      continue;
    if (entry.isSymbolicLink()) {
      if (!compiler) {
        const verified = await ownAliasBytes(root, path);
        verifiedAliases?.set(path, verified);
        rows.push({ path, bytes: verified.bytes.length, sha256: digest(verified.bytes) });
        continue;
      }
      assert(compiler, 'UnexpectedSnapshotSymlink:' + path);
      const target = await readlink(join(root, path)),
        absolute = await realpath(join(root, path)),
        inside = relative(root, absolute);
      assert(
        inside !== '..' && !inside.startsWith('../') && !isAbsolute(inside),
        'ExternalCompilerSymlink:' + path,
      );
      rows.push({ path, link: target });
      continue;
    }
    if (entry.isDirectory()) rows.push(...(await files(root, path, compiler, verifiedAliases)));
    else if (entry.isFile()) {
      const bytes = await readFile(join(root, path));
      rows.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
export { files as documentSearchSnapshotFiles };
export async function prepareDocumentSearchSnapshot(source, input) {
  const verifiedAliases = new Map();
  const sourceFiles = await files(source, '', false, verifiedAliases);
  await mkdir(input);
  for (const row of sourceFiles) {
    const target = join(input, row.path);
    await mkdir(dirname(target), { recursive: true });
    const verified = verifiedAliases.get(row.path);
    if (verified) await writeFile(target, verified.bytes, { flag: 'wx' });
    else await copyFile(join(source, row.path), target);
    await chmod(target, 0o444);
  }
  return { sourceFiles, sourceLinks: [...verifiedAliases.values()].map((v) => v.evidence) };
}
async function lockDirectories(root) {
  for (const entry of await readdir(root, { withFileTypes: true }))
    if (entry.isDirectory()) await lockDirectories(join(root, entry.name));
  await chmod(root, 0o555);
}
async function proveReadOnly(input, filename = 'build.zig') {
  for (const [path, flags] of [
    [join(input, filename), 'r+'],
    [join(input, '.write-denial-canary'), 'wx'],
  ]) {
    let denied = false;
    try {
      const handle = await open(path, flags);
      await handle.close();
      if (flags === 'wx') await unlink(path);
    } catch (error) {
      assert(['EACCES', 'EPERM'].includes(error.code), 'UnexpectedWriteProbeError');
      denied = true;
    }
    assert(denied, 'SnapshotWriteDenialMissing');
  }
  return {
    existingFile: 'write-open-denied',
    directory: 'create-denied',
    protectedContentsAccessed: false,
  };
}
async function save(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
export async function runDocumentSearchNative({ zig, out, source = ownRoot }) {
  assert(
    process.env.GITHUB_ACTIONS === 'true',
    'NativeExecutionRequiresExplicitCoordinatorOutsideCI',
  );
  assert(process.getuid?.() !== 0, 'NativeCiRequiresUnprivilegedUser');
  assert(isAbsolute(zig) && isAbsolute(out) && isAbsolute(source), 'AbsoluteNativePathsRequired');
  const compiler = await realpath(zig),
    compilerRoot = dirname(compiler);
  await mkdir(out);
  const input = join(out, 'input-source');
  const { sourceFiles, sourceLinks } = await prepareDocumentSearchSnapshot(source, input);
  await lockDirectories(input);
  const writeDenial = await proveReadOnly(input);
  const compilerWriteDenial = await proveReadOnly(compilerRoot, basename(compiler));
  const targets = documentSearchTargets(await readFile(join(input, 'build.zig'), 'utf8'));
  const sourcePin = digest(Buffer.from(JSON.stringify(sourceFiles)));
  await save(join(out, 'INPUTS.json'), {
    sourceFiles,
    sourceLinks,
    sourcePin,
    compiler,
    targets,
    writeDenial,
    compilerWriteDenial,
    protectedContentCopied: false,
    ciCheckout: process.env.GITHUB_SHA ?? null,
  });
  const results = [];
  for (const target of targets) {
    const group = join(out, target.step);
    await mkdir(group);
    const disk = await statfs(out, { bigint: true });
    assert(disk.bavail * disk.bsize >= 8n * 1024n ** 3n, 'NativeDiskBelow8GiB');
    const before = await files(input),
      compilerBefore = await files(compilerRoot, '', true);
    assert.deepEqual(before, sourceFiles, 'SourceChangedBeforeNative');
    await save(join(group, 'SOURCE-PRE.json'), before);
    await save(join(group, 'OS-MEMORY-PRE.json'), {
      meminfo: await readFile('/proc/meminfo', 'utf8'),
      pressure: await readFile('/proc/pressure/memory', 'utf8'),
      interpretation:
        'Linux-reported MemAvailable estimate and PSI, not an exact physical available-memory measurement',
    });
    await save(join(group, 'COMPILER-PRE.json'), compilerBefore);
    const local = join(group, 'cache'),
      global = join(group, 'global-cache'),
      tmp = join(group, 'tmp');
    for (const path of [local, global, tmp]) await mkdir(path);
    const ps = execFileSync('ps', ['-e', '-o', 'args='], { encoding: 'utf8' });
    assert(
      !ps.split('\n').some((line) => /\bzig\s+(?:test|build|build-exe|build-lib)\b/.test(line)),
      'ConcurrentNativeCompilerPresent',
    );
    const args = [
      '-n',
      '10',
      compiler,
      'test',
      target.path,
      '--test-filter',
      target.filter,
      '-O',
      'ReleaseSafe',
      '-fllvm',
      '-j1',
      '--cache-dir',
      local,
      '--global-cache-dir',
      global,
      '-femit-bin=' + join(group, 'probe'),
    ];
    const logPath = join(group, 'FIRST.log');
    const logFd = openSync(logPath, 'wx');
    let resourceFailure = null,
      peakRss = 0,
      stopTimer;
    const stopOwn = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
      stopTimer ??= setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 5000);
    };
    const child = spawn('/usr/bin/nice', args, {
      cwd: input,
      env: {
        ...process.env,
        ZIG_GLOBAL_CACHE_DIR: global,
        ZIG_LOCAL_CACHE_DIR: local,
        TMPDIR: tmp,
        NO_COLOR: '1',
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (bytes) => writeSync(logFd, bytes));
    const completion = new Promise((resolve) => {
      child.once('error', (error) => resolve({ code: null, error: String(error) }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    await save(join(group, 'LAUNCH.json'), {
      pid: child.pid,
      command: ['/usr/bin/nice', ...args],
      cwd: input,
      sourcePin,
      singleInvocation: true,
    });
    const timer = setInterval(() => {
      try {
        const rows = execFileSync('ps', ['-e', '-o', 'pgid=,rss='], { encoding: 'utf8' })
          .trim()
          .split('\n');
        const rss = rows.reduce((n, line) => {
          const [pgid, size] = line.trim().split(/\s+/).map(Number);
          return n + (pgid === child.pid ? size * 1024 : 0);
        }, 0);
        peakRss = Math.max(peakRss, rss);
        if (rss > 8 * 1024 ** 3 && !resourceFailure) {
          resourceFailure = { rss, limit: 8 * 1024 ** 3, onlyOwnGroup: child.pid };
          stopOwn();
        }
      } catch (error) {
        resourceFailure ??= { observationError: String(error) };
        stopOwn();
      }
    }, 1000);
    const exit = await completion;
    clearInterval(timer);
    clearTimeout(stopTimer);
    closeSync(logFd);
    const raw = await readFile(logPath);
    const after = await files(input),
      compilerAfter = await files(compilerRoot, '', true);
    await save(join(group, 'SOURCE-POST.json'), after);
    await save(join(group, 'COMPILER-POST.json'), compilerAfter);
    const observed = nativeSearchResults(raw.toString('utf8'), target.filter),
      named = observed.filter((row) => row.kind === 'named'),
      anonymous = observed.filter((row) => row.kind === 'anonymous');
    const passed =
      exit.code === 0 &&
      !resourceFailure &&
      named.length === target.named &&
      observed.every((row) => row.result === 'pass') &&
      JSON.stringify(before) === JSON.stringify(after) &&
      JSON.stringify(compilerBefore) === JSON.stringify(compilerAfter);
    const result = {
      target,
      ...exit,
      passed,
      observed,
      named: named.length,
      anonymous: anonymous.length,
      peakRss,
      resourceFailure,
      sourcePrePostEqual: JSON.stringify(before) === JSON.stringify(after),
      compilerPrePostEqual: JSON.stringify(compilerBefore) === JSON.stringify(compilerAfter),
      firstLogSha256: digest(raw),
      nativeInvocations: 1,
      automaticRetry: false,
    };
    await save(join(group, 'RESULT.json'), result);
    results.push(result);
    if (!passed) break;
  }
  const passed = results.length === targets.length && results.every((row) => row.passed);
  await save(join(out, 'RESULT.json'), {
    passed,
    results,
    notExecuted: targets.slice(results.length),
    sourcePin,
    automaticRetry: false,
    nativeInvocations: results.length,
  });
  assert(passed, 'DocumentSearchNativeFirstFailure');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.shift() === '--execute', 'ExplicitNativeExecutionFlagRequired');
  const options = {};
  for (const arg of args) {
    const match = /^--(zig|out|source)=(.+)$/.exec(arg);
    assert(match && !Object.hasOwn(options, match[1]), 'InvalidNativeArgument');
    options[match[1]] = match[2];
  }
  try {
    await runDocumentSearchNative(options);
  } catch (error) {
    if (options.out && isAbsolute(options.out)) {
      try {
        await save(join(options.out, 'FIRST-FAILURE.json'), {
          name: error.name,
          message: error.message,
          stack: error.stack,
          automaticRetry: false,
        });
      } catch {}
    }
    throw error;
  }
}
