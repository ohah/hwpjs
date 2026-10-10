/** Align measured flat content inside the final cell box, after row-span sizing. */
export function alignTableCellFlow(flow, cellHeight, insets, alignment = 0) {
  if (![0, 1, 2].includes(alignment)) throw new Error("UnsupportedCellVerticalAlignment");
  if (!flow || !Array.isArray(flow.rows) || ![flow.height, cellHeight, insets?.top, insets?.bottom].every(Number.isFinite) || flow.height < 0 || cellHeight <= 0 || insets.top < 0 || insets.bottom < 0) throw new Error("InvalidCellVerticalAlignment");
  // Top alignment adds no translation; retain existing projection overflow checks.
  if (alignment === 0) return flow;
  // Use the same addition order as grid content sizing; subtraction can lose an ulp.
  const required = flow.height + insets.top + insets.bottom;
  if (!Number.isFinite(required) || required > cellHeight) throw new Error("CellVerticalAlignmentOverflow");
  const shift = (cellHeight - required) * alignment / 2;
  if (!Number.isFinite(shift + flow.height)) throw new Error("InvalidCellVerticalAlignment");
  // 이미 영역을 채운 중첩 흐름은 이동할 필요가 없습니다.
  if (shift === 0) return flow;
  if (flow.boxes?.length || flow.columns) throw new Error("UnsupportedNestedCellVerticalAlignment");
  return { ...flow, height: flow.height + shift, rows: flow.rows.map(row => ({ ...row, y: row.y + shift })), ...(flow.flowPictures ? { flowPictures: flow.flowPictures.map(picture => ({ ...picture, rectangle: { ...picture.rectangle, y: picture.rectangle.y + shift } })) } : {}) };
}
