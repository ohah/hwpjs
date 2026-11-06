const uint32 = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
/** A display boundary only; Native still owns reference lifetime and mutation policy.
 * Inspect the fixed proven section/column pair, never scan text or skip arbitrary U+FFFC.
 * Missing or inconsistent evidence preserves the existing start at zero.
 */
export function hwp5StructuralEditableStart(row) {
  if (
    !row ||
    !uint32(row.section) ||
    !uint32(row.paragraph) ||
    row.selectionOwner !== `section:${row.section}:body` ||
    row.clipped ||
    row.tableCell ||
    row.drawingText ||
    row.drawingCaption ||
    row.createdCell ||
    row.textSourcePolicyError != null ||
    typeof row.text !== 'string' ||
    row.text.charCodeAt(0) !== 0xfffc ||
    row.text.charCodeAt(1) !== 0xfffc
  )
    return 0;
  const ref = row.currentReference;
  if (
    !ref ||
    ref.kind !== 'original' ||
    ref.section !== row.section ||
    typeof ref.id !== 'string' ||
    ref.id.length === 0 ||
    typeof ref.epoch !== 'string' ||
    ref.epoch.length === 0 ||
    ref.row !== 0 ||
    ref.column !== 0 ||
    typeof ref.scope !== 'string' ||
    ref.scope.length === 0
  )
    return 0;
  const offsets = row.sourceOffsets,
    anchors = row.structuralAnchors;
  if (
    !Array.isArray(offsets) ||
    offsets.length < 3 ||
    !Array.isArray(anchors) ||
    anchors.length !== 2
  )
    return 0;
  for (let i = 0; i < 3; i++) if (offsets[i]?.at !== i || offsets[i]?.source !== i * 8) return 0;
  for (let i = 0; i < 2; i++) {
    const anchor = anchors[i];
    if (
      anchor?.kind !== (i === 0 ? 'section' : 'column') ||
      anchor.paragraph !== row.paragraph ||
      anchor.source_unit !== i * 8 ||
      anchor.current_unit !== i * 8 ||
      anchor.unit !== i ||
      !uint32(anchor.control_node)
    )
      return 0;
  }
  return anchors[0].control_node !== anchors[1].control_node ? 2 : 0;
}
