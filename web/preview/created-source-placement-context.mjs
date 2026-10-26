// Derive display depth from placed source cells, never from editable identities.
export function bindCreatedSourcePlacements(
  rows,
  boxes,
  { baseDepth = 0, positionOwnerTableNode } = {},
) {
  const fail = () => ({ state: 'unavailable', error: 'InvalidCreatedSourcePlacement' });
  if (
    !Array.isArray(rows) ||
    !Array.isArray(boxes) ||
    !Number.isSafeInteger(baseDepth) ||
    baseDepth < 0
  )
    return fail();
  if (
    positionOwnerTableNode !== undefined &&
    (!Number.isSafeInteger(positionOwnerTableNode) || positionOwnerTableNode < 0)
  )
    return fail();
  const owners = new Map();
  const key = (row) => `${row.section}:${row.tableNode}:${row.listNode}:${row.pageOrdinal}`;
  for (const box of boxes) {
    if (box.tableNode === undefined) continue;
    if (
      ![box.section, box.tableNode, box.listNode, box.pageOrdinal].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      return fail();
    const id = key(box);
    if (owners.has(id)) return fail();
    owners.set(id, box);
  }
  const output = [];
  for (const row of rows) {
    if (row.createdHost === undefined || row.tableNode === undefined) {
      output.push(row);
      continue;
    }
    const box = owners.get(key(row)),
      local = box?.depth ?? 0,
      depth = baseDepth + local;
    const owner = positionOwnerTableNode ?? box?.positionOwnerTableNode ?? box?.tableNode;
    if (
      !box ||
      !Number.isSafeInteger(local) ||
      local < 0 ||
      !Number.isSafeInteger(depth) ||
      !Number.isSafeInteger(owner) ||
      owner < 0
    )
      return fail();
    output.push({ ...row, depth, positionOwnerTableNode: owner });
  }
  return { state: 'bound', rows: output };
}
