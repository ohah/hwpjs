// Explicit public demo allowlist; never expose arbitrary repository files.
import { trackedDemoFixtures } from './fixture-inventory.mjs';
export const demoFixturePrefix = '/web/preview/demo-fixtures/';
export const demoFixtures = Object.freeze([
  ...trackedDemoFixtures,
  Object.freeze({
    id: 'empty-table-cells-reference.hwp',
    name: '253E164F57A1BC6934-empty.hwp',
    label: 'HWP5 빈 표 셀 — CFB 보정 동의 필요 (참조)',
    path: 'reference/rhwp/samples/253E164F57A1BC6934-empty.hwp',
  }),
  Object.freeze({
    id: 'below-formula-reference.hwpx',
    name: 'copay_cap_tac_table_leading.hwpx',
    label: '아래쪽 SUM·비율 설명 (참조)',
    path: 'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx',
  }),
  Object.freeze({
    id: 'cascaded-formula-reference.hwpx',
    name: 'issue5543_carried_anchor_ladder.hwpx',
    label: '연쇄 SUM·병합 표 (참조)',
    path: 'reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx',
  }),
  Object.freeze({
    id: 'numeric-formula-reference.hwpx',
    name: '143E433F503322BD33.hwpx',
    label: '숫자 입력·표 계산 결과 (참조)',
    path: 'reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx',
  }),
  Object.freeze({
    id: 'administrative-manual.hwpx',
    name: '2025 행정업무운영 편람(최종).hwpx',
    path: 'reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx',
  }),
  Object.freeze({
    id: 'medical-exam-equipment.hwpx',
    name: '3184241_medical_exam_equipment.hwpx',
    label: '의료장비 — 중첩 표 (참조)',
    path: 'reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx',
  }),
  Object.freeze({
    id: 'training-dutmal.hwpx',
    name: '36389301_결재문서본문_직장훈련계획_덧말.hwpx',
    label: '직장훈련계획 — 덧말·중첩 표 (참조)',
    path: 'reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx',
  }),
]);
export function fixtureUrl(id) {
  if (!demoFixtures.some((item) => item.id === id)) throw new Error('UnknownDemoFixture');
  return `${demoFixturePrefix}${encodeURIComponent(id)}`;
}
