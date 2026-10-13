// Explicit public demo allowlist; never expose arbitrary repository files.
import { trackedDemoFixtures } from "./fixture-inventory.mjs";
export const demoFixturePrefix = "/web/preview/demo-fixtures/";
export const demoFixtures = Object.freeze([
  ...trackedDemoFixtures,
  Object.freeze({ id: "administrative-manual.hwpx", name: "2025 행정업무운영 편람(최종).hwpx", path: "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx" }),
  Object.freeze({ id: "medical-exam-equipment.hwpx", name: "3184241_medical_exam_equipment.hwpx", label: "의료장비 — 중첩 표 (참조)", path: "reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx" }),
  Object.freeze({ id: "training-dutmal.hwpx", name: "36389301_결재문서본문_직장훈련계획_덧말.hwpx", label: "직장훈련계획 — 덧말·중첩 표 (참조)", path: "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx" }),
]);
export function fixtureUrl(id) {
  if (!demoFixtures.some(item => item.id === id)) throw new Error("UnknownDemoFixture");
  return `${demoFixturePrefix}${encodeURIComponent(id)}`;
}
