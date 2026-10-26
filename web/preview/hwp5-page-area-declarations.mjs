const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const areaKind = (kind) => kind === 'header' || kind === 'footer';
const key = (section, node) => `${section}:${node}`;

// Adapt already decoded control identities and display anchors to the shared selector.
export function withHwp5PageAreaDeclarations(content) {
  if (!content.pageAreaSources?.length) return content;
  if (
    !Array.isArray(content.paragraphs) ||
    content.structuralAnchorErrors?.length ||
    content.pageAreaSourceErrors?.length
  )
    throw new Error('MissingHwp5PageAreaDeclarations');
  const owners = new Map();
  for (const source of content.pageAreaSources) {
    if (!source || ![source.section, source.owner_node].every(uint) || !areaKind(source.kind))
      throw new Error('InvalidHwp5PageAreaDeclaration');
    const id = key(source.section, source.owner_node);
    if (owners.has(id)) throw new Error('AmbiguousHwp5PageAreaDeclaration');
    owners.set(id, source);
  }
  const declarations = [],
    seen = new Set();
  for (const paragraph of content.paragraphs) {
    for (const anchor of paragraph.structuralAnchors ?? []) {
      if (!areaKind(anchor.kind)) continue;
      const id = key(paragraph.section, anchor.control_node),
        source = owners.get(id);
      if (
        !source ||
        source.kind !== anchor.kind ||
        ![paragraph.section, paragraph.paragraph, anchor.control_node, anchor.unit].every(uint) ||
        anchor.paragraph !== paragraph.paragraph ||
        paragraph.clipped ||
        paragraph.text?.[anchor.unit] !== '\ufffc'
      )
        throw new Error('InvalidHwp5PageAreaDeclaration');
      if (seen.has(id)) throw new Error('AmbiguousHwp5PageAreaDeclaration');
      seen.add(id);
      declarations.push({
        section: paragraph.section,
        paragraph: paragraph.paragraph,
        sourceElement: anchor.control_node,
        unit: anchor.unit,
      });
    }
  }
  if (seen.size !== owners.size) throw new Error('MissingHwp5PageAreaDeclaration');
  declarations.sort(
    (a, b) => a.section - b.section || a.paragraph - b.paragraph || a.unit - b.unit,
  );
  return { ...content, pageAreaDeclarations: declarations, pageAreaDeclarationErrors: [] };
}
