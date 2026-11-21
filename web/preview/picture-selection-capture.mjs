// A host selection witness only. Native/Core separately admit resource editing.
export function capturePictureSelection(read) {
  const before = read();
  const picture = before?.picture;
  if (
    !picture ||
    !before.receipt ||
    !before.source ||
    ![picture.section, picture.pictureNode].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff,
    )
  )
    return null;
  const { section, pictureNode } = picture;
  const { receipt, source, epoch } = before;
  if (!['hwp5', 'hwpx'].includes(source.format) || !Array.isArray(source.pictures)) return null;
  const matches = source.pictures.filter(
    (row) => row?.section === section && row?.pictureNode === pictureNode,
  );
  if (matches.length !== 1) return null;
  const row = matches[0];
  const rows = source.pictures;
  const rowIndex = rows.indexOf(row);
  const count = rows.length;
  let physical = pictureNode;
  if (source.format === 'hwp5') {
    // Canonical HWP5 projection: the Canvas id is the component, while the
    // resource owner is SHAPE_PICTURE. Never substitute the resize command id.
    if (
      !Number.isSafeInteger(row.recordNode) ||
      row.recordNode < 0 ||
      row.recordNode > 0xffffffff ||
      row.source?.component_node !== pictureNode ||
      row.source?.picture_node !== row.recordNode
    )
      return null;
    physical = row.recordNode;
  }
  return Object.freeze({
    section,
    pictureNode: physical,
    current() {
      const after = read();
      return (
        after?.receipt === receipt &&
        after?.source === source &&
        after?.epoch === epoch &&
        source.pictures === rows &&
        rows.length === count &&
        rows[rowIndex] === row &&
        row.section === section &&
        row.pictureNode === pictureNode &&
        (source.format !== 'hwp5' ||
          (row.recordNode === physical &&
            row.source?.component_node === pictureNode &&
            row.source?.picture_node === physical)) &&
        after?.picture?.section === section &&
        after?.picture?.pictureNode === pictureNode
      );
    },
  });
}
