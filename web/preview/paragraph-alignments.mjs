// Shared display enum; native ABI ordinals remain format-specific.
export const paragraphAlignments = Object.freeze(
  [
    { value: 0, key: "JUSTIFY", label: "양쪽 정렬" },
    { value: 1, key: "LEFT", label: "왼쪽 정렬" },
    { value: 2, key: "RIGHT", label: "오른쪽 정렬" },
    { value: 3, key: "CENTER", label: "가운데 정렬" },
    { value: 4, key: "DISTRIBUTE", label: "배분 정렬" },
    { value: 5, key: "DISTRIBUTE_SPACE", label: "공백 배분" },
  ].map(Object.freeze),
);
export const paragraphAlignmentKey = (value) =>
  paragraphAlignments.find((entry) => entry.value === value)?.key ?? null;
export const paragraphAlignmentValue = (key) =>
  paragraphAlignments.find((entry) => entry.key === key)?.value;
export const paragraphAlignmentLabel = (value) =>
  paragraphAlignments.find((entry) => entry.value === value)?.label;
