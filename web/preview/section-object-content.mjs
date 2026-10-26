const inventories = [
  'hwp5Drawings',
  'drawings',
  'rectangles',
  'polygons',
  'containers',
  'pictures',
  'lines',
  'tables',
  'createdTables',
  'oles',
  'chartTargets',
  'pageAreaDeclarations',
  'pageAreaDeclarationErrors',
  'hwp5Notes',
  'hwp5NoteErrors',
  'hwp5NotePolicies',
  'hwp5NoteShapeErrors',
];

/** Keep object identities in their declared section; never infer from node IDs. */
export function sectionObjectContent(content, section, declaredSections = null) {
  if (!Number.isSafeInteger(section) || section < 0) throw new Error('UnsupportedPageSections');
  const selected = {};
  for (const key of inventories) {
    if (content[key] === undefined) continue;
    if (
      !Array.isArray(content[key]) ||
      content[key].some((row) => !row || !Number.isSafeInteger(row.section) || row.section < 0)
    )
      throw new Error('AmbiguousSectionObjects');
    if (declaredSections && content[key].some((row) => !declaredSections.has(row.section)))
      throw new Error('UnsupportedPageSections');
    selected[key] = content[key].filter((row) => row.section === section);
  }
  return { ...content, ...selected };
}
