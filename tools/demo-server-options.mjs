import { resolve } from 'node:path';
export function parseDemoServerArguments(args, root) {
  let port = 8082,
    seenPort = false,
    bundleDirectory,
    privateFixtures = false;
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--private-fixtures') {
      if (privateFixtures) throw Error('DuplicatePrivateFixtures');
      privateFixtures = true;
    } else if (value === '--bundle-dir' || value.startsWith('--bundle-dir=')) {
      if (bundleDirectory) throw Error('DuplicateBundleDirectory');
      const directory = value === '--bundle-dir' ? args[++i] : value.slice('--bundle-dir='.length);
      if (!directory || directory.startsWith('--')) throw Error('MissingBundleDirectory');
      bundleDirectory = resolve(root, directory);
    } else {
      if (seenPort || !/^\d+$/.test(value)) throw Error('InvalidServerArgument');
      port = Number(value);
      seenPort = true;
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('InvalidPort');
  if (privateFixtures && !bundleDirectory) throw Error('PrivateBundleRequired');
  return { port, bundleDirectory, privateFixtures };
}
