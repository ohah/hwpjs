// Explicit public demo allowlist; never expose arbitrary repository files.
import { trackedDemoFixtures } from "./fixture-inventory.mjs";
export const demoFixturePrefix = "/web/preview/demo-fixtures/";
export const demoFixtures = Object.freeze([
  ...trackedDemoFixtures,
  Object.freeze({ id: "administrative-manual.hwpx", name: "2025 행정업무운영 편람(최종).hwpx", path: "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx" }),
]);
export function fixtureUrl(id) {
  if (!demoFixtures.some(item => item.id === id)) throw new Error("UnknownDemoFixture");
  return `${demoFixturePrefix}${encodeURIComponent(id)}`;
}
