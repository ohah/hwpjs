// Test resolution only: use the real core source without installing/linking peers.
// This is not a fake HeadlessEditor implementation.
import { plugin } from 'bun';
plugin({
  name: 'native-tests-real-core-source',
  setup(build) {
    build.onResolve({ filter: /^@hwpjs\/core$/ }, () => ({ path: new URL('../../../core/src/index.ts', import.meta.url).pathname }));
  },
});
