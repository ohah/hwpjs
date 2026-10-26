import { readdirSync, lstatSync } from 'node:fs';
import { resolve, relative, dirname, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

import { SOURCE_ROOTS, EXTENSIONS, LINT_EXTENSIONS, excludedPath } from './quality-policy.mjs';
import { assertQualityConfigs } from './sync-quality-config.mjs';
export { SOURCE_ROOTS, EXTENSIONS, LINT_EXTENSIONS, excludedPath };

function collectFilesystemFiles(root) {
  const files = [],
    excluded = [];
  const visit = (path) => {
    const reason = excludedPath(path);
    if (reason) {
      excluded.push({ path, reason });
      return;
    }
    const absolute = resolve(root, path);
    let entry;
    try {
      entry = lstatSync(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (entry.isSymbolicLink()) {
      excluded.push({ path, reason: 'symlink' });
      return;
    }
    if (entry.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) visit(path ? path + '/' + child : child);
    } else if (entry.isFile() && EXTENSIONS.has(extname(path))) files.push(path);
  };
  for (const source of SOURCE_ROOTS) visit(source);
  // 루트 설정/빌드 진입점도 누락하지 않는다. 루트의 다른 디렉터리는 열지 않는다.
  for (const name of readdirSync(root).sort()) {
    if (excludedPath(name) || !EXTENSIONS.has(extname(name))) continue;
    if (lstatSync(resolve(root, name)).isFile()) visit(name);
  }
  return { files: files.sort(), excluded };
}
function gitTrackedNames(root) {
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (resolve(top) !== resolve(root)) throw Error('Git 최상위 경로가 아닙니다.');
    return new Set(
      execFileSync('git', ['-C', root, 'ls-files', '--cached', '-z'], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .split('\0')
        .filter(Boolean),
    );
  } catch {
    throw Error(
      'Git 최상위 작업 트리가 필요합니다. Git 없는 경계 검사는 --filesystem을 명시하세요.',
    );
  }
}
export function collectFiles(root, { includeUntracked = false, filesystem = false } = {}) {
  const cached = filesystem ? undefined : gitTrackedNames(root);
  const inventory = collectFilesystemFiles(root),
    allActiveFiles = inventory.files;
  const trackedFiles = cached ? allActiveFiles.filter((path) => cached.has(path)) : [];
  const untrackedFiles = cached ? allActiveFiles.filter((path) => !cached.has(path)) : [];
  const files = filesystem || includeUntracked ? allActiveFiles : trackedFiles;
  return {
    ...inventory,
    files,
    allActiveFiles,
    scope: filesystem
      ? 'filesystem'
      : includeUntracked
        ? 'tracked-and-untracked'
        : 'tracked-and-staged',
    trackedFiles,
    untrackedFiles,
    untrackedOmitted: filesystem || includeUntracked ? [] : untrackedFiles,
    counts: {
      activeLocal: allActiveFiles.length,
      activeTracked: cached ? trackedFiles.length : null,
      activeUntracked: cached ? untrackedFiles.length : null,
      selected: files.length,
      omittedUntracked: filesystem || includeUntracked ? 0 : untrackedFiles.length,
    },
  };
}
export function selectFiles(root, requested = [], options = {}) {
  const inventory = collectFiles(root, options);
  if (!requested.length) return inventory;
  const allowed = new Set(inventory.allActiveFiles);
  const files = requested.map((name) => {
    const path = relative(root, resolve(root, name)).replaceAll('\\', '/');
    if (
      !path ||
      path.startsWith('../') ||
      isAbsolute(path) ||
      excludedPath(path) ||
      !allowed.has(path)
    )
      throw Error('검사 허용 경로가 아닙니다: ' + name);
    return path;
  });
  const selected = [...new Set(files)].sort(),
    set = new Set(selected);
  return {
    ...inventory,
    files: selected,
    scope: 'explicit',
    untrackedOmitted: inventory.untrackedFiles.filter((path) => !set.has(path)),
    counts: {
      ...inventory.counts,
      selected: selected.length,
      omittedUntracked: inventory.untrackedFiles.filter((path) => !set.has(path)).length,
    },
  };
}
export function parseQualityArgs(args) {
  const [mode = 'check', ...rest] = args;
  let includeUntracked = false,
    filesystem = false;
  const requested = [];
  for (const arg of rest) {
    if (arg === '--') continue;
    if (arg === '--include-untracked') includeUntracked = true;
    else if (arg === '--filesystem') filesystem = true;
    else if (arg.startsWith('--')) throw Error('지원하지 않는 검사 옵션: ' + arg);
    else requested.push(arg);
  }
  return { mode, requested, includeUntracked, filesystem };
}
export function runQuality({
  root,
  mode,
  requested = [],
  includeUntracked = false,
  filesystem = false,
  binDir = resolve(root, 'node_modules/.bin'),
  configDir = root,
}) {
  const modes = new Set(['files', 'lint', 'lint:fix', 'format', 'format:check', 'check']);
  if (!modes.has(mode)) throw Error('지원하지 않는 검사 모드: ' + mode);
  const inventory = selectFiles(root, requested, { includeUntracked, filesystem });
  if (mode === 'files') {
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
    return inventory.files.length ? 0 : 1;
  }
  if (!inventory.files.length) throw Error('활성 소스 목록이 비어 있습니다.');
  assertQualityConfigs(configDir);
  console.error(
    `[quality] scope=${inventory.scope} selected=${inventory.files.length} omittedUntracked=${inventory.untrackedOmitted.length}`,
  );
  const operations = mode === 'check' ? ['lint', 'format:check'] : [mode];
  let exit = 0;
  for (const operation of operations) {
    const lint = operation.startsWith('lint'),
      tool = lint ? 'oxlint' : 'oxfmt';
    if (lint && !inventory.files.some((path) => LINT_EXTENSIONS.has(extname(path))))
      throw Error('lint 대상 파일이 비어 있습니다.');
    const args = [
      '--config',
      resolve(configDir, lint ? '.oxlintrc.json' : '.oxfmtrc.json'),
      '--threads=2',
      '--disable-nested-config',
    ];
    if (lint) {
      args.push('--max-warnings=0');
      if (operation === 'lint:fix') args.push('--fix');
    } else args.push(operation === 'format' ? '--write' : '--check');
    // 작은 argv 묶음이며 실패하더라도 다음 묶음을 검사한다. 파일 내용을 shell에 넣지 않는다.
    for (let at = 0; at < inventory.files.length; at += 100) {
      const paths = inventory.files
        .slice(at, at + 100)
        .filter((path) => !lint || LINT_EXTENSIONS.has(extname(path)));
      if (!paths.length) continue;
      console.error(`[quality] ${operation}: ${paths.length} files`);
      const child = spawnSync(resolve(binDir, tool), [...args, '--', ...paths], {
        cwd: root,
        stdio: 'inherit',
        shell: false,
      });
      if (child.error) throw child.error;
      if (child.signal) throw Error(`${tool} 중단: ${child.signal}`);
      if (child.status !== 0) exit = child.status || 1;
    }
  }
  return exit;
}
const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  try {
    process.exitCode = runQuality({
      root: resolve(dirname(self), '..'),
      ...parseQualityArgs(process.argv.slice(2)),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
