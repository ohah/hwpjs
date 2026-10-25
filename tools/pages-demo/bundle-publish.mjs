import {lstat, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {assertOutputPath, rejectSymlinkAncestors, validateBundle} from './bundle-validation.mjs';

async function requireAbsent(path, errorName) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw Error(errorName);
}
/** Publish only fully validated inputs and preserve unowned or modified output. */
export async function publishBundle(bundle, {root, output}) {
  assertOutputPath(root, output);
  if (output === bundle.directory || output.startsWith(bundle.directory + '/') || bundle.directory.startsWith(output + '/')) {
    throw Error('OverlappingBundleOutput');
  }
  await rejectSymlinkAncestors(output);
  const stage = output + '.packaging', backup = output + '.previous';
  await requireAbsent(stage, 'PackagingStageAlreadyExists');
  await requireAbsent(backup, 'BundleBackupAlreadyExists');
  let existing = false;
  try { await lstat(output); existing = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) await validateBundle(output);
  await mkdir(stage, {recursive: true});
  let moved = false;
  try {
    for (const [path, bytes] of bundle.files) {
      await mkdir(dirname(resolve(stage, path)), {recursive: true});
      await writeFile(resolve(stage, path), bytes);
    }
    if (existing) { await rename(output, backup); moved = true; }
    await rename(stage, output);
  } catch (error) {
    if (moved) await rename(backup, output);
    await rm(stage, {recursive: true, force: true});
    throw error;
  }
  // A cleanup failure leaves a recoverable backup; it cannot roll back committed output.
  if (moved) await rm(backup, {recursive: true});
}
