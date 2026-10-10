/** Select an exact opaque solid brush; other variants are not flattened. */
export function selectDrawingBrush(content, drawing) {
  const fail = error => ({ state: "unavailable", error });
  const fillNode = drawing.source?.paint?.fill_node;
  if (fillNode === null) return { state: "none" };
  const reports = (content.fillBrushReports ?? []).filter(r => r.section === drawing.section);
  if (reports.length !== 1 || content.fillBrushErrors?.some(r => r.section === drawing.section)) return fail("MissingDrawingFillSource");
  const report = reports[0].report;
  const matches = report.brushes.map((b, i) => ({ b, i })).filter(({ b }) => b.element_index === fillNode && b.parent_element_index === drawing.drawingNode && b.part_kind === "section" && b.section_ordinal === drawing.section);
  if (matches.length !== 1) return fail("AmbiguousDrawingFillSource");
  const { b, i } = matches[0];
  const nodes = report.nodes.filter(n => n.brush_index === i);
  return { state: "selected", brush: b, nodes, report };
}

export function drawingSolidFill(content, drawing) {
  const selected = selectDrawingBrush(content, drawing);
  if (selected.state !== "selected") return selected;
  const fail = error => ({ state: "unavailable", error });
  const b = selected.brush, nodes = selected.nodes;
  if (b.direct_children !== 1 || b.other_attributes !== 0 || nodes.length !== 1 || nodes[0].kind !== "win_brush") return fail("UnsupportedDrawingFillVariant");
  const n = nodes[0];
  if (n.direct_children !== 0 || n.other_attributes !== 0 || n.unknown_enums !== 0 || n.non_six_hex_colors !== 0 || n.raw[2] !== null || n.raw[3] !== "0" || !/^#[0-9a-f]{6}$/i.test(n.raw[0] ?? "")) return fail("UnsupportedDrawingSolidFill");
  return { state: "solid", color: n.raw[0] };
}
