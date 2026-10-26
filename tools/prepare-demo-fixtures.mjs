// Generated public assets, restricted to the same explicit demo allowlist.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoFixtures } from '../web/preview/fixture-catalog.mjs';
import { prepareFixturePlan } from './demo-fixture-plan.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'web/preview/demo-fixtures');
await mkdir(destination, { recursive: true });
const plan = await prepareFixturePlan(root, demoFixtures);
for (const { target, bytes } of plan) {
  await writeFile(target, bytes);
}
console.log(JSON.stringify({ prepared: demoFixtures.length, destination }));
