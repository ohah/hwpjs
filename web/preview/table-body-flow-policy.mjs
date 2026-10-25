import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
const key = row => `${row.section}:${row.paragraph}`;

/** Validate exact body ownership before any table pagination publishes rows. */
export function tableBodyFlowFailure(body, flows, reference, { allowColumns = false } = {}) {
  const byKey = new Map();
  for (const flow of flows) {
    if (byKey.has(key(flow))) return { flowReason: "DuplicateTableBodyFlow", section: flow.section, paragraph: flow.paragraph };
    byKey.set(key(flow), flow);
  }
  for (const paragraph of body) {
    const flow = byKey.get(key(paragraph));
    const owner = { section: paragraph.section, paragraph: paragraph.paragraph };
    if (!flow) return { ...owner, flowReason: "MissingTableBodyFlow" };
    if (flow.top_level !== true || flow.host !== "body") return { ...owner, flowReason: "UnsupportedTableBodyHost" };
    if (flow.column_break === true && (allowColumns !== true || flow.single_column === true))
      return { ...owner, flowReason: "UnsupportedTableBodyColumnBreak" };
    if (flow.single_column !== true) {
      const columns = flow.column_declaration == null ? null : columnReferenceBoxes(reference, flow.column_declaration);
      if (columns?.state !== "placed" || (columns.boxes.length !== 1 && allowColumns !== true)) return { ...owner, flowReason: "UnsupportedTableBodyColumns" };
    }
  }
  if (byKey.size !== body.length) return { flowReason: "AmbiguousTableBodyFlow" };
  return null;
}
