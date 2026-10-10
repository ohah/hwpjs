// Labels only; native resource IDs remain authoritative.
export function formatOptions(ids, shapes = []) {
  const byId = new Map((Array.isArray(shapes) ? shapes : []).map(shape => [shape.id, shape]));
  return ids.map(id => {
    const shape = byId.get(id), parts = [`ID ${id}`];
    if (shape?.bold === true) parts.push("굵게");
    if (shape?.italic === true) parts.push("기울임");
    if (Number.isInteger(shape?.height) && shape.height > 0) parts.push(`원문 ${shape.height / 100}pt`);
    return { value: String(id), label: parts.join(" · ") };
  });
}
