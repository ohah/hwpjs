import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// Unknown identifiers fail closed. Extend this list deliberately when a bundled
// package introduces another SPDX license; never infer a license from its text.
const licenses = new Set([
  '0BSD',
  'Apache-1.1',
  'Apache-2.0',
  'Artistic-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-3-Clause-Clear',
  'BSD-4-Clause',
  'BSL-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'EPL-2.0',
  'ICU',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'NCSA',
  'OpenSSL',
  'PSF-2.0',
  'Python-2.0',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'Unlicense',
  'WTFPL',
  'Zlib',
]);
const exceptions = new Set(['LLVM-exception', 'Classpath-exception-2.0']);
const scopeKeys = new Set([
  'type',
  'main',
  'module',
  'types',
  'typings',
  'sideEffects',
  'exports',
  'imports',
]);
const licenseNames = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'license',
  'license.md',
  'license.txt',
];
const noticeNames = ['NOTICE', 'NOTICE.md', 'NOTICE.txt', 'notice', 'notice.md', 'notice.txt'];
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function fail(reason, path) {
  throw new Error(`${reason}:${path}`);
}
function within(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}
function validateSpdx(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail('InvalidBundledDependencySPDX', path);
  if (/\b(?:A|L)?GPL(?:-|\b)/i.test(value)) fail('ForbiddenBundledDependencyLicense', path);
  const tokens = value.match(/[A-Za-z0-9.+-]+|[()]/g) ?? [];
  if (tokens.join('') !== value.replace(/\s/g, '')) fail('InvalidBundledDependencySPDX', path);
  if (tokens.length > 256) fail('InvalidBundledDependencySPDX', path);
  let index = 0;
  function primary() {
    if (tokens[index] === '(') {
      index++;
      expression();
      if (tokens[index++] !== ')') fail('InvalidBundledDependencySPDX', path);
      return;
    }
    if (!licenses.has(tokens[index++])) fail('UnknownBundledDependencyLicense', path);
    if (tokens[index] === 'WITH') {
      index++;
      if (!exceptions.has(tokens[index++])) fail('UnknownBundledDependencyLicenseException', path);
    }
  }
  function conjunction() {
    primary();
    while (tokens[index] === 'AND') {
      index++;
      primary();
    }
  }
  function expression() {
    conjunction();
    while (tokens[index] === 'OR') {
      index++;
      conjunction();
    }
  }
  expression();
  if (index !== tokens.length) fail('InvalidBundledDependencySPDX', path);
}

/** Collect only the installed packages actually reached by the bundler.
 * observe must read and pin the supplied file, returning its original Buffer.
 * Module-scope package.json files (e.g. Zod v4/core) are pinned too, but do not
 * replace the enclosing named package's identity or licensing obligations.
 */
export async function collectPublicPackageNotices({ root, sourcePaths, observe }) {
  if (!isAbsolute(root) || !Array.isArray(sourcePaths) || typeof observe !== 'function') {
    throw new TypeError('InvalidPublicPackageNoticesInput');
  }
  const lexicalRoot = resolve(root);
  const actualRoot = await realpath(lexicalRoot);
  const parents = new Map();
  const packages = new Map();
  const reads = new Map();
  async function observed(path, category) {
    let actual;
    try {
      actual = await realpath(path);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (!within(actualRoot, actual)) fail('BundledDependencyOutsideRoot', path);
    const key = category + ':' + actual;
    if (!reads.has(key))
      reads.set(
        key,
        (async () => {
          const bytes = await observe(actual, category);
          if (!Buffer.isBuffer(bytes)) fail('InvalidBundledDependencyObservedBytes', actual);
          let text;
          try {
            text = decoder.decode(bytes);
          } catch {
            fail('InvalidBundledDependencyUTF8', actual);
          }
          return { text, actual };
        })(),
      );
    return reads.get(key);
  }
  async function owner(directory, boundary) {
    if (parents.has(directory)) return parents.get(directory);
    const pending = (async () => {
      if (!within(boundary, directory) || directory === actualRoot) {
        fail('BundledDependencyPackageMissing', directory);
      }
      const metadata = await observed(
        join(directory, 'package.json'),
        'bundled-dependency-package',
      );
      if (metadata) {
        let info;
        try {
          info = JSON.parse(metadata.text);
        } catch {
          fail('InvalidBundledDependencyPackageJSON', metadata.actual);
        }
        if (!info || Array.isArray(info) || typeof info !== 'object') {
          fail('InvalidBundledDependencyPackage', metadata.actual);
        }
        const scopeOnly =
          !('name' in info || 'version' in info || 'license' in info) &&
          ['module', 'commonjs'].includes(info.type) &&
          Object.keys(info).every((key) => scopeKeys.has(key));
        if (!scopeOnly) {
          if (
            typeof info.name !== 'string' ||
            !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(info.name) ||
            typeof info.version !== 'string' ||
            !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(info.version)
          ) {
            fail('InvalidBundledDependencyPackageIdentity', metadata.actual);
          }
          validateSpdx(info.license, metadata.actual);
          return { directory, name: info.name, version: info.version, license: info.license };
        }
      }
      if (directory === boundary) fail('BundledDependencyPackageMissing', directory);
      return owner(dirname(directory), boundary);
    })();
    parents.set(directory, pending);
    return pending;
  }
  for (const path of sourcePaths) {
    if (typeof path !== 'string' || !isAbsolute(path))
      fail('InvalidBundledDependencySourcePath', String(path));
    const lexical = resolve(path);
    if (!within(lexicalRoot, lexical) && !within(actualRoot, lexical))
      fail('BundledDependencyOutsideRoot', path);
    if (!relative(lexicalRoot, lexical).split(sep).includes('node_modules')) continue;
    const actual = await realpath(lexical);
    if (!within(actualRoot, actual)) fail('BundledDependencyOutsideRoot', path);
    const parts = relative(actualRoot, actual).split(sep);
    const at = parts.lastIndexOf('node_modules');
    if (at < 0) continue; // A workspace symlink resolves to project-owned source.
    const count = parts[at + 1]?.startsWith('@') ? 3 : 2;
    if (parts.length <= at + count) fail('InvalidBundledDependencySourcePath', path);
    const boundary = join(actualRoot, ...parts.slice(0, at + count));
    const pkg = await owner(dirname(actual), boundary);
    packages.set(pkg.directory, pkg);
  }
  const sections = [];
  for (const pkg of [...packages.values()].sort((a, b) => a.directory.localeCompare(b.directory))) {
    const files = [];
    let licenseCount = 0;
    const seenFiles = new Set();
    for (const name of [...licenseNames, ...noticeNames]) {
      const file = await observed(join(pkg.directory, name), 'bundled-dependency-license');
      if (!file || seenFiles.has(file.actual)) continue;
      seenFiles.add(file.actual);
      if (!file.text.trim()) fail('EmptyBundledDependencyLicense', file.actual);
      if (licenseNames.includes(name)) licenseCount++;
      files.push(`### ${name}\n\n${file.text}`);
    }
    if (!licenseCount) fail('BundledDependencyLicenseMissing', pkg.directory);
    sections.push(
      `## Bundled dependency: ${pkg.name}@${pkg.version}\n\nSPDX: ${pkg.license}\n\n${files.join('\n\n')}`,
    );
  }
  return sections.length ? '\n\n' + sections.join('\n\n') + '\n' : '';
}
