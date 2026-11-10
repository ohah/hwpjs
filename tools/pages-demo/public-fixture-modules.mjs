import { assertPublicText } from './bundle-validation.mjs';

/** Build boundary only: repository catalog modules are never loaded. */
export function publicFixtureModules(policy) {
  const rows = policy.files.map(({ id, name, label }) => ({ id, name, label }));
  const inventory = `export const trackedDemoFixtures=Object.freeze(${JSON.stringify(rows)}.map(Object.freeze));\n`;
  const catalog = `import {trackedDemoFixtures} from './fixture-inventory.mjs';
export const demoFixtures=trackedDemoFixtures;
export const demoFixturePrefix=new URL('../fixtures/',import.meta.url).href;
export function fixtureUrl(id){if(!demoFixtures.some(row=>row.id===id))throw Error('UnknownDemoFixture');return demoFixturePrefix+encodeURIComponent(id);}\n`;
  assertPublicText('fixture-inventory.js', Buffer.from(inventory));
  return { inventory, catalog };
}
