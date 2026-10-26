const paragraphNamespace = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const metadata = new Set([
  "offset",
  "orgSz",
  "curSz",
  "flip",
  "rotationInfo",
  "renderingInfo",
  "sz",
  "pos",
  "outMargin",
  "shapeComment",
]);
const xmlKinds = new Map([
  ["container", "container"],
  ["rect", "rectangle"],
  ["pic", "picture"],
  ["ellipse", "ellipse"],
  ["curve", "curve"],
]);
// 포맷별 원문을 유지하면서 공통 소비자에게 자식 종류만 전달합니다.
export function groupShapeChildren(source, { allowCaptions = false } = {}) {
  const native = Object.hasOwn(source ?? {}, "shape_children"),
    xml = Object.hasOwn(source ?? {}, "children");
  if (native === xml) throw new Error("AmbiguousGroupChildrenSource");
  const rows = native ? source.shape_children : source.children;
  if (!Array.isArray(rows)) throw new Error("InvalidGroupChildrenSource");
  return Array.from(rows, (row) => {
    if (!row || !Number.isInteger(row.node) || row.node < 0 || row.node > 0xffffffff)
      throw new Error("InvalidGroupChildrenSource");
    if (native) {
      if (
        !["container", "rectangle", "picture", "line", "polygon", "unsupported"].includes(row.kind)
      )
        throw new Error("InvalidGroupChildrenSource");
      return { node: row.node, kind: row.kind };
    }
    const caption =
      allowCaptions &&
      source.has_caption === true &&
      source.caption?.caption_node === row.node &&
      Number.isSafeInteger(source.caption.list_node) &&
      source.caption.list_node > row.node &&
      row.local_name === "caption";
    const kind =
      row.namespace_uri === paragraphNamespace
        ? (xmlKinds.get(row.local_name) ??
          (caption ? "caption" : metadata.has(row.local_name) ? "metadata" : "unsupported"))
        : "unsupported";
    return { node: row.node, kind };
  });
}
