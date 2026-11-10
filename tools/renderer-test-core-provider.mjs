// 명시된 실제 SDK의 파일만 연결한다. 함수나 문서 모델을 대체하지 않는다.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.HWPJS_TEST_CORE_DIST;
if (!directory) throw Error('ExplicitRendererCoreDistRequired');
const dist = resolve(directory);
const manifest = JSON.parse(readFileSync(resolve(dist, 'build-manifest.json'), 'utf8'));
const packageRoot = resolve(dist, '..');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
if (packageJson.name !== '@hwpjs/core') throw Error('RendererCorePackageMismatch');
const checked = new Map();
function provider(subpath) {
  if (checked.has(subpath)) return checked.get(subpath);
  const entry = packageJson.exports?.[subpath];
  const target = typeof entry === 'string' ? entry : entry?.import;
  if (typeof target !== 'string' || !target.startsWith('./'))
    throw Error('RendererCoreExportTargetMissing');
  const path = resolve(packageRoot, target);
  const file = relative(dist, path);
  if (
    !file ||
    isAbsolute(file) ||
    file === '..' ||
    file.startsWith('../') ||
    file.startsWith('..\\')
  )
    throw Error('RendererCoreExportOutsideDist');
  const expected = manifest.files?.[file.split('\\').join('/')];
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
    throw Error('RendererCoreManifestPinMissing');
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== expected)
    throw Error('RendererCoreManifestPinMismatch');
  const url = pathToFileURL(path).href;
  checked.set(subpath, url);
  return url;
}
const index = provider('.');
const nativeGeometry = provider('./_internal/native-geometry');
const importer = (relative) => pathToFileURL(resolve(root, relative)).href;
const surface = importer('packages/vanilla/src/surface.ts');
const indexImporters = new Set([
  importer('web/preview/owned-body-draft-paragraph-index.mjs'),
  surface,
  importer('packages/vanilla/tests/undo-onset-surface-fixture.ts'),
  importer('packages/vanilla/tests/table-grid-view-surface.test.ts'),
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@hwpjs/core' && indexImporters.has(context.parentURL))
      return { url: index, shortCircuit: true };
    if (specifier === '@hwpjs/core/_internal/native-geometry' && context.parentURL === surface)
      return { url: nativeGeometry, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
