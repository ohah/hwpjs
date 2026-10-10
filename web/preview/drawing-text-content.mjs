export function attachDrawingTextBindings(editor, content) {
  content.drawingTextBindingErrors = [];
  content.drawingTextSnapshotErrors = [];
  content.drawings = [];
  const paragraphs = new Map(content.paragraphs.map(paragraph => [`${paragraph.section}:${paragraph.paragraph}`, paragraph]));
  for (const paragraph of content.paragraphs) { delete paragraph.drawingText; delete paragraph.drawingCaption; }
  for (const section of new Set(content.paragraphs.map(paragraph => paragraph.section))) {
    try {
      const allRows = editor.drawingTextBindings(section);
      const selectedDrawings = content.window ? new Set(allRows.filter(row => paragraphs.has(`${section}:${row.paragraph - 1}`)).map(row => row.drawingNode)) : null;
      const rows = selectedDrawings ? allRows.filter(row => selectedDrawings.has(row.drawingNode)) : allRows;
      if (rows.some(row => !paragraphs.has(`${section}:${row.paragraph - 1}`))) throw new Error("DrawingTextDisplayBindingMismatch");
      for (const row of rows) {
        const paragraph = paragraphs.get(`${section}:${row.paragraph - 1}`);
        if (row.kind === "caption") paragraph.drawingCaption = { drawingNode: row.drawingNode, captionNode: row.textNode, listNode: row.listNode };
        else paragraph.drawingText = { drawingNode: row.drawingNode, textNode: row.textNode, listNode: row.listNode };
      }
      for (const drawingNode of new Set(rows.map(row => row.drawingNode))) {
        try {
          const source = editor.drawingTextSnapshot(section, drawingNode);
          if (source.drawing_node !== drawingNode || !paragraphs.has(`${section}:${source.paragraph - 1}`)) throw new Error("DrawingTextDisplayBindingMismatch");
          content.drawings.push({ section, drawingNode, hostParagraph: source.paragraph - 1, anchorUnit: source.anchor_unit, source });
        } catch (error) { content.drawingTextSnapshotErrors.push({ section, drawingNode, error: error.message }); }
      }
    } catch (error) { content.drawingTextBindingErrors.push({ section, error: error.message }); }
  }
  return content;
}
