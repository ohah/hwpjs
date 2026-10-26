export function drawingPageAnchor(drawing, paragraphs, pageRows) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !drawing ||
    !Number.isSafeInteger(drawing.anchorUnit) ||
    drawing.anchorUnit < 0 ||
    !Array.isArray(pageRows) ||
    !Array.isArray(paragraphs)
  )
    return unavailable('InvalidDrawingPageAnchor');
  const owners = paragraphs.filter(
    (p) => p.section === drawing.section && p.paragraph === drawing.hostParagraph,
  );
  if (
    owners.length !== 1 ||
    typeof owners[0].text !== 'string' ||
    owners[0].text[drawing.anchorUnit] !== '\ufffc'
  )
    return unavailable('InvalidDrawingPageAnchor');
  const hosts = pageRows.filter(
    (row) =>
      row.kind === 'text' &&
      row.section === drawing.section &&
      row.paragraph === drawing.hostParagraph &&
      row.startUnit <= drawing.anchorUnit &&
      drawing.anchorUnit < row.endUnit,
  );
  if (hosts.length !== 1) return unavailable('AmbiguousDrawingPageAnchor');
  const host = hosts[0];
  if (
    !Number.isSafeInteger(host.pageOrdinal) ||
    host.pageOrdinal < 0 ||
    ![host.x, host.y, host.width, host.height].every(Number.isFinite)
  )
    return unavailable('InvalidDrawingPageAnchor');
  return { state: 'selected', host };
}
