export function hwp5CaptionGeometry(source) {
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!source || ![source.flags, source.attributes, source.list_node].every(uint) || ![0, 8].includes(source.extra_bytes) || source.extra_bytes === 8 && source.extra_nonzero !== false || (source.flags & ~7) !== 0 || (source.attributes & ~127) !== 0
    || !Number.isInteger(source.width) || source.width < 0 || source.width > 0xffffffff
    || !Number.isInteger(source.gap) || source.gap < -32768 || source.gap > 32767)
    throw new Error("UnsupportedHwp5CaptionGeometry");
  return { caption_node: source.list_node, list_node: source.list_node,
    side: source.flags & 3, full_size: Boolean(source.flags & 4), width: source.width, gap: source.gap,
    text_direction: source.attributes & 7, line_wrap: (source.attributes >>> 3) & 3,
    vertical_alignment: (source.attributes >>> 5) & 3 };
}
export function attachHwp5CaptionGeometry(content) {
  content.hwp5CaptionGeometryErrors = [];
  for (const table of content.tables ?? []) { delete table.sourceCaption; table.captionParagraphs = []; }
  for (const paragraph of content.paragraphs ?? []) delete paragraph.tableCaption;
  const captions = content.hwp5Captions ?? [];
  const sections = new Set([...captions.map(row => row.section), ...(content.tables ?? []).filter(row => row.sourceGeometry).map(row => row.section)]);
  for (const section of sections) {
    try {
      for (const table of content.tables.filter(row => row.section === section && row.sourceGeometry?.has_caption !== undefined)) {
        const present = captions.some(row => row.section === section && row.tableNode === table.tableNode);
        if (table.sourceGeometry.has_caption !== present) throw new Error("Hwp5CaptionPresenceMismatch");
      }
      const prepared = [], seenTables = new Set(), seenParagraphs = new Set();
      for (const caption of captions.filter(row => row.section === section)) {
        const tables = content.tables.filter(row => row.section === section && row.tableNode === caption.tableNode);
        if (tables.length !== 1 || seenTables.has(caption.tableNode)) throw new Error("AmbiguousHwp5TableCaption");
        const table = tables[0], source = hwp5CaptionGeometry(caption.source), paragraphs = [];
        for (const id of caption.paragraphs) {
          const matches = content.paragraphs.filter(row => row.section === section && row.paragraph === id);
          if (matches.length !== 1 || matches[0].clipped || matches[0].tableCell || seenParagraphs.has(id)) throw new Error("InvalidHwp5CaptionParagraph");
          seenParagraphs.add(id); paragraphs.push(matches[0]);
        }
        seenTables.add(caption.tableNode); prepared.push({ table, source, paragraphs, ids: caption.paragraphs });
      }
      for (const { table, source, paragraphs, ids } of prepared) {
        table.sourceCaption = source; table.captionParagraphs = [...ids];
        for (const paragraph of paragraphs) paragraph.tableCaption = { tableNode: table.tableNode, captionNode: source.caption_node, listNode: source.list_node };
      }
    } catch (error) { content.hwp5CaptionGeometryErrors.push({ section, error: error.message }); }
  }
  return content;
}
