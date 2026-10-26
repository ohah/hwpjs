// Derived display ownership only; native editing remains authoritative.
export function attachTableCaptions(editor, sections, content) {
  content.tableCaptionBindingErrors = [];
  for (const paragraph of content.paragraphs) delete paragraph.tableCaption;
  for (const table of content.tables) table.captionParagraphs = [];
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  const tables = new Map(content.tables.map((t) => [`${t.section}:${t.tableNode}`, t]));
  for (const { index } of sections) {
    let bindings;
    try {
      bindings = editor.tableCaptionBindings(index);
    } catch (error) {
      content.tableCaptionBindingErrors.push({ section: index, error: error.message });
      continue;
    }
    for (const { paragraph: nativeParagraph, owner } of bindings) {
      const id = nativeParagraph - 1;
      const table = tables.get(`${index}:${owner.table_node}`);
      const paragraph = paragraphs.get(`${index}:${id}`);
      if (!table) {
        if (content.window && !paragraph) continue;
        content.tableCaptionBindingErrors.push({
          section: index,
          paragraph: id,
          error: 'MissingCaptionTable',
        });
        continue;
      }
      if (!paragraph) {
        table.partial = true;
        continue;
      }
      if (paragraph.clipped) table.partial = true;
      table.captionParagraphs.push(id);
      paragraph.tableCaption = {
        tableNode: owner.table_node,
        captionNode: owner.caption_node,
        listNode: owner.list_node,
      };
    }
  }
  return content;
}
