// Source roles come from the native model; this layer only formats labels.
const roles = { name: "계열명", category: "범주", value: "값", x: "X값", y: "Y값", bubble_size: "거품 크기", unclassified: "미분류 값" };
export function chartPointLabel(chart, point, ordinal) {
  const binding = chart.bindings?.[ordinal];
  const role = binding?.point === ordinal && Object.hasOwn(roles, binding.role) ? roles[binding.role] : null;
  const series = role && Number.isInteger(binding.series_node) && binding.series_node >= 0 ? ` · 계열 노드 ${binding.series_node}` : "";
  return `${role ?? `캐시 ${point.cache_node ?? "?"}`}${series} · 포인트 ${point.index} · ${point.kind}`;
}
