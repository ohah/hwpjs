import { readdir, readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(resolve(root, 'verification'), { recursive: true });
const manifests = new Set(),
  visited = new Set();
async function exists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}
async function scanModules(directory) {
  let canonical;
  try {
    canonical = await realpath(directory);
  } catch {
    return;
  }
  if (visited.has(canonical)) return;
  visited.add(canonical);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.name.startsWith('@')) {
      for (const child of await readdir(path, { withFileTypes: true }))
        await scanPackage(resolve(path, child.name));
    } else await scanPackage(path);
  }
}
async function scanPackage(directory) {
  let canonical;
  try {
    canonical = await realpath(directory);
    await readFile(resolve(canonical, 'package.json'));
  } catch {
    return;
  }
  manifests.add(resolve(canonical, 'package.json'));
  await scanModules(resolve(canonical, 'node_modules'));
}
const candidates = [resolve(root, 'node_modules/.bun'), resolve(root, '../../node_modules/.bun')];
const store = (await Promise.all(candidates.map(exists))).findIndex(Boolean);
let layout;
if (store >= 0) {
  layout = 'isolated';
  for (const entry of await readdir(candidates[store], { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    if (entry.isDirectory())
      await scanModules(resolve(candidates[store], entry.name, 'node_modules'));
  }
} else {
  layout = 'hoisted';
  await scanModules(resolve(root, 'node_modules'));
}
if (manifests.size === 0)
  throw Error('설치된 패키지 metadata가 0개입니다. 먼저 frozen install을 실행하세요.');
const packages = [],
  missing = [];
for (const manifest of [...manifests].sort()) {
  const pkg = JSON.parse(await readFile(manifest, 'utf8'));
  let license = typeof pkg.license === 'object' ? pkg.license?.type : pkg.license;
  if (!license && pkg.licenses) license = pkg.licenses.map((x) => x.type).join(' OR ');
  const row = { name: pkg.name, version: pkg.version, license: license ?? null };
  if (!license) {
    const files = (await readdir(dirname(manifest))).filter((x) => /^(license|copying)/i.test(x));
    row.licenseFiles = files;
    const texts = await Promise.all(
      files.map((f) => readFile(resolve(dirname(manifest), f), 'utf8').catch(() => '')),
    );
    if (texts.some((t) => /GNU (?:LESSER |AFFERO )?GENERAL PUBLIC LICENSE/i.test(t)))
      throw Error(`금지 라이선스 전문 발견: ${pkg.name}`);
    missing.push(row);
  }
  if (/(?:^|[^A-Z])(?:A?GPL|LGPL)(?:[-\s\d.]|$)/i.test(license ?? ''))
    throw Error(`금지 라이선스 발견: ${pkg.name}: ${license}`);
  packages.push(row);
}
const report = {
  checkedAt: new Date().toISOString(),
  layout,
  checkedManifests: packages.length,
  prohibitedLicenses: [],
  missingLicenseMetadata: missing,
  packages,
};
await writeFile(
  resolve(root, 'verification/licenses.json'),
  JSON.stringify(report, null, 2) + '\n',
);
if (missing.length)
  throw Error(`라이선스 metadata 추가 확인 필요: ${missing.map((x) => x.name).join(', ')}`);
console.log(`설치 metadata 라이선스 검사 ${packages.length}개 (${layout}); GPL/LGPL 없음`);
