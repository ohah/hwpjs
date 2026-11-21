const key = (value) => `${value.section}:${value.drawingNode}`;

// This admission is deliberately limited to plain direct HWPX body textboxes.
// Existing grouped/picture/table compositors retain their own ordering rules.
export function behindTextboxScopeError(content, retainedDrawings = [], retainedContainers = []) {
  const drawings = content.drawings ?? [];
  if (!drawings.some((d) => d.source?.flow?.text_wrap === 2)) return null;
  if (content.format !== 'hwpx') return 'UnsupportedBehindTextboxFormat';
  if (
    retainedDrawings.length ||
    retainedContainers.length ||
    [
      'containers',
      'pictures',
      'tables',
      'ellipses',
      'curves',
      'curveTextSources',
      'forms',
      'formTexts',
      'checkBoxes',
    ].some((name) => content[name]?.length) ||
    content.paragraphs.some((p) => p.tableCell || p.drawingCaption)
  )
    return 'UnsupportedBehindTextboxBodyObjects';
  if (
    drawings.some(
      (d) =>
        d.source?.flow?.text_wrap !== 2 ||
        d.source.group_context !== null ||
        d.source.caption !== null ||
        d.source.geometry?.treat_as_character !== false,
    )
  )
    return 'UnsupportedBehindTextboxOwnership';
  return null;
}

/** Atomic behind objects: each fill, outline and owned rows share one z slot. */
export function behindTextboxScene(layout, outlines) {
  const owners = new Set(),
    commands = [];
  const drawings = (layout.placedDrawings ?? [])
    .filter((d) => d.behindTextbox === true)
    .toSorted((a, b) => a.zOrder - b.zOrder);
  if (!drawings.length) return { owners, commands };
  const rowsByOwner = new Map(),
    outlinesByOwner = new Map();
  for (const [index, row] of layout.rows.entries()) {
    if (row.drawingNode === undefined) continue;
    const owner = key(row);
    if (!rowsByOwner.has(owner)) rowsByOwner.set(owner, []);
    rowsByOwner.get(owner).push({ row, index });
  }
  for (const item of outlines.behind ?? []) {
    const owner = key(item.drawing);
    if (!outlinesByOwner.has(owner)) outlinesByOwner.set(owner, []);
    outlinesByOwner.get(owner).push(item);
  }
  for (const drawing of drawings) {
    const owner = key(drawing);
    if (
      drawing.layer !== 'behind' ||
      owners.has(owner) ||
      !Number.isInteger(drawing.zOrder) ||
      drawing.zOrder < -2147483648 ||
      drawing.zOrder > 2147483647
    )
      throw Error('InvalidBehindTextboxPaintOwner');
    owners.add(owner);
    commands.push({ kind: 'fill', item: drawing });
    for (const item of outlinesByOwner.get(owner) ?? []) commands.push({ kind: 'outline', item });
    for (const { row, index } of rowsByOwner.get(owner) ?? []) {
      if (row.drawingPaintLayer !== 'behind' || row.drawingPaintZOrder !== drawing.zOrder)
        throw Error('InvalidBehindTextboxRowLayer');
      commands.push({ kind: 'row', item: row, index });
    }
  }
  return { owners, commands };
}

export function paintBehindTextboxScene(scene, { fill, outline, row }) {
  for (const command of scene.commands) {
    if (command.kind === 'fill') fill(command.item);
    else if (command.kind === 'outline') outline(command.item);
    else row(command.item, command.index);
  }
}
