import test from "node:test";
import assert from "node:assert/strict";
import { chartPointLabel } from "../../web/preview/chart-point-label.mjs";

test("chart labels use native source roles without guessing missing or mismatched bindings", () => {
  const point = { cache_node: 3, index: 0, kind: "numeric_cache" };
  const chart = role => ({ bindings: [{ point: 0, role, series_node: 20 }] });
  for (const [role, expected] of Object.entries({ name: "계열명", category: "범주", value: "값", x: "X값", y: "Y값", bubble_size: "거품 크기", unclassified: "미분류 값" })) {
    assert.equal(chartPointLabel(chart(role), point, 0), `${expected} · 계열 노드 20 · 포인트 0 · numeric_cache`);
  }
  const fallback = "캐시 3 · 포인트 0 · numeric_cache";
  assert.equal(chartPointLabel({}, point, 0), fallback);
  assert.equal(chartPointLabel(chart("unexpected"), point, 0), fallback);
  assert.equal(chartPointLabel(chart("toString"), point, 0), fallback);
  assert.equal(chartPointLabel(chart("value"), point, 1), fallback);
  assert.equal(chartPointLabel({ bindings: [{ point: 1, role: "value", series_node: 20 }] }, point, 0), fallback);
  assert.equal(chartPointLabel({ bindings: [{ point: 0, role: "unclassified", series_node: null }] }, point, 0), "미분류 값 · 포인트 0 · numeric_cache");
});
