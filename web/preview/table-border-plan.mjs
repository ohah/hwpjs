import { tableSemanticFillProjection } from "./table-semantic-fill-source.mjs";
import { tableSemanticFaceFill } from "./table-semantic-face-fill.mjs";
import { selectedTableImageFill } from "./table-image-fill.mjs";
// 원본 선 종류와 단위를 Canvas 정책으로 변환합니다. 미지원 효과는 대체하지 않습니다.
import { selectedFillPlan } from "./selected-fill-plan.mjs";
import { hwp5TableBorderPaintIndex } from "./hwp5-table-border-plan.mjs";
import { tableBorderStrokeParts } from "./table-border-stroke.mjs";
export function tableBorderPaintPlan(style) {
  let fill;
  const fail = () => ({ state: "unavailable", error: "UnsupportedTableBorderPaint", ...(fill ? {fill} : {}) });
  if (!style || style.unknown_children !== 0 || style.unknown_attributes !== 0) return fail();
  if (style.fill_node !== null) {
    const report=style.fill_report,b=report?.brushes?.[0];
    if (report?.brushes?.length!==1 || !b || typeof b!=="object" || Array.isArray(b) || b.part_kind!=="header" || b.section_ordinal!==null
      || b.element_index!==style.fill_node || b.parent_element_index!==style.node || !Array.isArray(report.nodes)
      || report.nodes.some(n=>!n || typeof n!=="object" || Array.isArray(n) || n.brush_index!==0)) return fail();
    const selected={state:"selected",brush:b,nodes:report.nodes,report};
    const projection = tableSemanticFillProjection(style, selected);
    if (projection.state === "unavailable") { fill = projection; return fail(); }
    fill=selectedFillPlan(selected, projection.project);
    if(fill.state==="unavailable"){const image=selectedTableImageFill(selected);if(image.state==="image")fill=image;}
    if(!["solid","linear_gradient","pattern","image","none"].includes(fill.state)) return fail();
    if(fill.state==="none")fill=undefined;
  }
  if (style.fill_node === null && Object.hasOwn(style, "semantic_fill_colors")) {
    const projection = tableSemanticFillProjection(style, null);
    if (projection.state === "unavailable") { fill = projection; return fail(); }
  }
  fill = tableSemanticFaceFill(style, fill);
  if (fill?.state === "unavailable") return fail();
  // 배경 소유권은 테두리 효과와 별개입니다. 효과 거부 시에도 확인된 단색은 보존합니다.
  if (!["0", "false"].includes(style.three_d) || !["0", "false"].includes(style.shadow)
    || style.center_line !== "NONE" || style.slash !== "NONE" || style.back_slash !== "NONE"
    || !Array.isArray(style.edges) || style.edges.length !== 4) return fail();
  const strokes = [];
  for (const [index, edge] of style.edges.entries()) {
    if (!edge) return fail();
    if (edge.style === "NONE") continue;
    if (!["SOLID", "DOUBLE_SLIM"].includes(edge.style) || typeof edge.width !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)? mm$/.test(edge.width)
      || typeof edge.color !== "string" || !/^#[0-9a-f]{6}$/i.test(edge.color)) return fail();
    const width = Number(edge.width.slice(0, -3)) * 96 / 25.4;
    if (!Number.isFinite(width) || width <= 0) return fail();
    const stroke = { edge: index, width, color: edge.color, ...(edge.style === "DOUBLE_SLIM" ? { compound: "DOUBLE_SLIM" } : {}) };
    if (!tableBorderStrokeParts(stroke)) return fail();
    strokes.push(stroke);
  }
  const plan=strokes.length ? { state: "strokes", strokes } : { state: "none" };
  return fill ? {...plan,fill} : plan;
}
const key = box => `${box.section}:${box.tableNode}:${box.listNode}`;
export function tableBorderPaintIndex(content) {
  if (Array.isArray(content.hwp5BorderFillSources)) return hwp5TableBorderPaintIndex(content);
  const index = { available: Array.isArray(content.tableBorderSources), cells: new Map() };
  for (const report of content.tableBorderSources ?? []) {
    if (report.sourceOnly !== true) continue;
    for (const cell of report.cells) {
      const identity = `${report.section}:${cell.table_node}:${cell.list_node}`;
      index.cells.set(identity, index.cells.has(identity) ? { state: "unavailable", error: "AmbiguousTableBorderPaint" }
        : tableBorderPaintPlan(cell.style_index === null ? null : report.styles[cell.style_index]));
    }
  }
  return index;
}
export function tableBorderPlanForBox(index, box) {
  if (box.createdCell || !index.available) return { state: "proxy" };
  return index.cells.get(key(box)) ?? { state: "unavailable", error: "MissingTableBorderPaintSource" };
}

// A source cell can have many page fragments but exactly one selected fill.
export function tableBackgroundFillForSource(index, section, listNode) {
  let selected = null;
  for (const [identity, plan] of index.cells) {
    const [ownerSection, , ownerList] = identity.split(":").map(Number);
    if (ownerSection !== section || ownerList !== listNode) continue;
    if (plan.fill?.state !== "image") throw new Error("MissingTableBackgroundFillSource");
    if (selected && JSON.stringify(selected) !== JSON.stringify(plan.fill)) throw new Error("AmbiguousTableBackgroundFillSource");
    selected = plan.fill;
  }
  if (!selected) throw new Error("MissingTableBackgroundFillSource");
  return selected;
}
