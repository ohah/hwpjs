import { placeFloatingTable } from "./table-placement.mjs";

const validBox = box => box && [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;

// Explicit current paragraph bounds, not an inferred parent-cell paragraph.
export function positionNestedFloatingTable(table, parent, paragraph, references) {
  const unavailable = error => ({ state: "unavailable", error });
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (![table?.section, table?.tableNode, table?.parentTableNode, table?.parentListNode, table?.hostParagraph, parent?.section, parent?.tableNode, parent?.listNode, paragraph?.section, paragraph?.paragraph].every(uint)) return unavailable("InvalidNestedFloatingTableOwner");
  if (!table || !parent || !paragraph || table.parentTableNode !== parent.tableNode || table.parentListNode !== parent.listNode || table.section !== parent.section || paragraph.section !== table.section || paragraph.paragraph !== table.hostParagraph) return unavailable("InvalidNestedFloatingTableOwner");
  if (!validBox(parent) || !validBox(paragraph) || !validBox(references?.paper)) return unavailable("MissingNestedFloatingTableBounds");
  const source = table.sourceGeometry;
  if (!source || ![0, 1, 2, 3, 4].includes(source.text_wrap)) return unavailable("UnsupportedNestedFloatingTableWrap");
  const placement = placeFloatingTable(table, { ...references, paragraph });
  if (placement.state !== "placed") return { ...unavailable("UnsupportedNestedFloatingTablePosition"), placementState: placement.state };
  const rectangle = placement.rectangle, paper = references.paper;
  if (rectangle.x < paper.x || rectangle.y < paper.y || rectangle.x + rectangle.width > paper.x + paper.width || rectangle.y + rectangle.height > paper.y + paper.height) return { ...unavailable("NestedFloatingTablePaperOverflow"), tableNode: table.tableNode, parentTableNode: parent.tableNode, rectangle, paper: { ...paper }, paragraphBounds: { ...paragraph } };
  return { state: "positioned", rectangle, paintLayer: source.text_wrap === 2 ? "behind" : "front", textWrap: source.text_wrap,
    outsideParentCell: rectangle.x < parent.x || rectangle.y < parent.y || rectangle.x + rectangle.width > parent.x + parent.width || rectangle.y + rectangle.height > parent.y + parent.height,
    owner: { section: table.section, tableNode: table.tableNode, parentTableNode: parent.tableNode, parentListNode: parent.listNode, paragraph: paragraph.paragraph } };
}
