// Labels describe existing resources; they are not partial format commands.
import { paragraphSpacing } from "./paragraph-geometry.mjs";
import { paragraphAlignmentLabel } from "./paragraph-alignments.mjs";
export function paragraphFormatOptions(ids, shapes = []) {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  return ids.map((id) => {
    const shape = byId.get(id),
      parts = [`ID ${id}`];
    const alignment = paragraphAlignmentLabel(shape?.alignment);
    if (alignment) parts.push(alignment);
    if (Number.isInteger(shape?.indent)) parts.push(`들여쓰기 ${shape.indent} HWPUNIT`);
    const { kind: spacingKind, value: spacingValue } = paragraphSpacing(shape);
    if (spacingKind === 0 && Number.isInteger(spacingValue)) parts.push(`줄 간격 ${spacingValue}%`);
    return { value: String(id), label: parts.join(" · ") };
  });
}
