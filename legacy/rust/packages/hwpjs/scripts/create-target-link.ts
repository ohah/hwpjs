import { symlink, existsSync, lstatSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { promisify } from 'node:util';

const symlinkAsync = promisify(symlink);

const scriptDir = __dirname;
const packageDir = dirname(scriptDir);
const targetLink = join(packageDir, 'target');
const workspaceTarget = resolve(packageDir, '../../target');

async function main() {
  if (existsSync(targetLink)) {
    const stats = lstatSync(targetLink);
    if (stats.isSymbolicLink()) {
      console.log('✓ Symlink already exists');
      return;
    }
    console.warn('⚠ target exists but is not a symlink');
    return;
  }

  try {
    await symlinkAsync(workspaceTarget, targetLink, 'dir');
    console.log(`✓ Created symlink: ${targetLink} -> ${workspaceTarget}`);
  } catch (error: any) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn('⚠ Failed to create symlink. On Windows, you may need to run as administrator.');
      console.warn('  Manual command: mklink /D target ..\\..\\target');
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
