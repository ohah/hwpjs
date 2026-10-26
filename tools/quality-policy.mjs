// 검사 범위·제외 사유·도구 설정의 유일한 원본. 두 .ox*rc.json은 이 파일의 파생물이다.
export const SOURCE_ROOTS = Object.freeze([
  'apps',
  'packages',
  'js',
  'web/preview',
  'tools',
  'tests',
  'src',
]);
export const LINT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.svelte',
]);
export const EXTENSIONS = new Set([...LINT_EXTENSIONS, '.css', '.scss']);
const policy = [
  {
    kind: 'basename',
    reason: 'protected',
    values: ['title-column-roundtrip.test.mjs', 'hwpers_test4_complex_table.hwp'],
  },
  {
    kind: 'exact',
    reason: 'intentional invalid DTS oracle',
    values: ['packages/hwpjs/tests/fixtures/__tests__/nodefixture.d.ts'],
  },
  {
    kind: 'directory',
    reason: 'generated/vendor/cache',
    values: [
      'node_modules',
      '.git',
      '.cache',
      '.zig-cache',
      'zig-cache',
      'zig-out',
      'legacy',
      'vendor',
      'third_party',
      'generated',
      'dist',
      'doc_build',
      'coverage',
      '.rspress',
      '.vite',
      'Pods',
      'DerivedData',
    ],
  },
  {
    kind: 'prefix',
    reason: 'public snapshot',
    values: ['apps/docs/docs/public/editor', 'apps/demo/public', 'public'],
  },
  {
    kind: 'below',
    reason: 'native generated build',
    root: 'packages/react-native/examples',
    values: ['ios/build', 'android/app/build'],
  },
  { kind: 'filename', reason: 'generated filename', values: ['min', 'generated', 'gen'] },
];
export function excludedPath(input) {
  const path = input.replaceAll('\\', '/'),
    parts = path.split('/'),
    name = parts.at(-1);
  for (const rule of policy) {
    const excluded = rule.values.some((value) => {
      if (rule.kind === 'basename' || rule.kind === 'directory') return parts.includes(value);
      if (rule.kind === 'exact') return path === value;
      if (rule.kind === 'prefix') return path === value || path.startsWith(value + '/');
      if (rule.kind === 'filename') return name.includes('.' + value + '.');
      if (rule.kind === 'below' && path.startsWith(rule.root + '/')) {
        const rest = path.slice(rule.root.length + 1);
        return (
          rest === value ||
          rest.startsWith(value + '/') ||
          rest.endsWith('/' + value) ||
          rest.includes('/' + value + '/')
        );
      }
      return false;
    });
    if (excluded) return rule.reason;
  }
}
export function ignorePatterns() {
  return policy.flatMap((rule) =>
    rule.values.map((value) => {
      if (rule.kind === 'basename') return '**/' + value;
      if (rule.kind === 'directory') return '**/' + value + '/**';
      if (rule.kind === 'prefix') return value + '/**';
      if (rule.kind === 'below') return rule.root + '/**/' + value + '/**';
      if (rule.kind === 'filename') return '**/*.' + value + '.*';
      return value;
    }),
  );
}

const defaults = {
  '.oxlintrc.json': {
    $schema: './node_modules/oxlint/configuration_schema.json',
    categories: {
      correctness: 'error',
    },
    env: {
      browser: true,
      node: true,
    },
    globals: {
      Bun: 'readonly',
    },
  },
  '.oxfmtrc.json': {
    $schema: './node_modules/oxfmt/configuration_schema.json',
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    endOfLine: 'lf',
    sortImports: false,
    sortPackageJson: false,
    svelte: true,
  },
};
export function toolConfigs() {
  return Object.fromEntries(
    Object.entries(defaults).map(([name, value]) => [
      name,
      { ...value, ignorePatterns: ignorePatterns() },
    ]),
  );
}
