import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const UI_LICENSE_FILES = Object.freeze([
  Object.freeze(['react', 'LICENSE']),
  Object.freeze(['react-dom', 'LICENSE']),
  Object.freeze(['svelte', 'LICENSE.md']),
]);

/** Rebuild notice metadata from the dependencies actually resolved for this build. */
export async function collectUiLicenseInputs({
  root,
  read = readFile,
  resolvePackage = (name) => fileURLToPath(import.meta.resolve(name + '/package.json')),
}) {
  const project = await read(resolve(root, 'LICENSE'));
  const parts = [(await read(resolve(root, 'docs/third-party-notices.md'))).toString()];
  const packages = [];
  for (const [name, licenseName] of UI_LICENSE_FILES) {
    const metadataPath = resolvePackage(name);
    const metadata = JSON.parse((await read(metadataPath)).toString());
    if (
      metadata.name !== name ||
      metadata.license !== 'MIT' ||
      typeof metadata.version !== 'string' ||
      !metadata.version.trim()
    )
      throw Error('UnexpectedPackageLicense:' + name);
    const original = await read(resolve(dirname(metadataPath), licenseName));
    if (!original.length) throw Error('EmptyDependencyLicense:' + name);
    parts.push(
      `\n\n===== ${name} ${metadata.version} — ${metadata.license} =====\n\n` + original.toString(),
    );
    packages.push({
      name,
      version: metadata.version,
      license: metadata.license,
      licenseSha256: createHash('sha256').update(original).digest('hex'),
    });
  }
  return {
    project,
    notices: Buffer.from(parts.join('')),
    manifest: { project: 'LICENSE.txt', thirdParty: 'THIRD_PARTY_NOTICES.txt', packages },
  };
}
