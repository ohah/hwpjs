import { resolve } from 'node:path';
export function parseDemoServerArguments(args, root) {
  let port = 8082,
    seenPort = false,
    bundleDirectory,
    fixturePolicyPath,
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
    } else if (value === '--fixture-policy' || value.startsWith('--fixture-policy=')) {
      if (fixturePolicyPath !== undefined) throw Error('DuplicateFixturePolicy');
      const path =
        value === '--fixture-policy' ? args[++i] : value.slice('--fixture-policy='.length);
      if (!path || path.startsWith('--')) throw Error('MissingFixturePolicy');
      fixturePolicyPath = resolve(root, path);
    } else {
      if (seenPort || !/^\d+$/.test(value)) throw Error('InvalidServerArgument');
      port = Number(value);
      seenPort = true;
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('InvalidPort');
  if (privateFixtures && !bundleDirectory) throw Error('PrivateBundleRequired');
  if (fixturePolicyPath !== undefined && !bundleDirectory)
    throw Error('FixturePolicyBundleRequired');
  return {
    port,
    bundleDirectory,
    privateFixtures,
    ...(fixturePolicyPath === undefined ? {} : { fixturePolicyPath }),
  };
}
