export function decodeTablePlacements(bytes, format = "hwpx") {
  const fail = () => {
    throw new Error("InvalidTablePlacements");
  };
  if (!["hwp5", "hwpx"].includes(format) || !(bytes instanceof Uint8Array) || bytes.length < 8)
    return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    count = view.getUint32(4, true);
  const magic = view.getUint32(0, true),
    hasAnchor = format === "hwpx" && magic === 0x32505448,
    stride = hasAnchor ? 28 : 20;
  if (
    (!hasAnchor && magic !== (format === "hwp5" ? 0x35505448 : 0x31505448)) ||
    count > 100000 ||
    bytes.length !== 8 + count * stride
  )
    return fail();
  const seen = new Set();
  const rows = Array.from({ length: count }, (_, index) => {
    const at = 8 + index * stride,
      values = Array.from({ length: 5 }, (_, column) => view.getUint32(at + column * 4, true));
    const [tableNode, paragraph, parentTable, parentList, flags] = values;
    if (
      (format === "hwpx" && !paragraph) ||
      flags > 1 ||
      seen.has(tableNode) ||
      (!flags && (parentTable || parentList)) ||
      (flags && parentTable === tableNode)
    )
      return fail();
    seen.add(tableNode);
    const anchorUnit = hasAnchor ? view.getUint32(at + 20, true) : 0,
      anchorPresent = hasAnchor ? view.getUint32(at + 24, true) : 0;
    if (anchorPresent > 1 || (!anchorPresent && anchorUnit !== 0)) return fail();
    return {
      tableNode,
      paragraph,
      parentTableNode: flags ? parentTable : null,
      parentListNode: flags ? parentList : null,
      ...(hasAnchor ? { anchorUnit: anchorPresent ? anchorUnit : null } : {}),
    };
  });
  const byNode = new Map(rows.map((row) => [row.tableNode, row])),
    checked = new Set();
  for (const row of rows) {
    let node = row;
    const path = new Set();
    while (node && !checked.has(node.tableNode)) {
      if (path.has(node.tableNode)) return fail();
      path.add(node.tableNode);
      if (node.parentTableNode === null) break;
      node = byNode.get(node.parentTableNode);
      if (!node) return fail();
    }
    for (const node of path) checked.add(node);
  }
  return rows;
}
