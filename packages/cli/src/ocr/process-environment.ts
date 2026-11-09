// Only host settings required by local OCR are inherited. This is not an OS sandbox.
const inheritedNames = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'WINDIR',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'TESSDATA_PREFIX',
] as const;

export function ocrProcessEnvironment(
  source: Readonly<NodeJS.ProcessEnv> = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = Object.create(null);
  for (const name of inheritedNames) {
    const value = source[name];
    if (typeof value === 'string') environment[name] = value;
  }
  // Windows environment names are case insensitive. Normalize common spellings
  // without copying unknown variables or introducing duplicate Path/PATH keys.
  environment.PATH ??= source.Path ?? source.path;
  environment.SystemRoot ??= source.SYSTEMROOT ?? source.systemroot;
  environment.WINDIR ??= source.windir;
  environment.OMP_THREAD_LIMIT = '1';
  return environment;
}
