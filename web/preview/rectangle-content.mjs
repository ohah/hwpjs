/** Complete section rectangle inventory, including nontext and grouped members. */
export function attachRectangleSources(editor, content) {
  content.rectangles = [];
  content.rectangleSourceErrors = [];
  const paragraphs = new Set(content.paragraphs.map(p => `${p.section}:${p.paragraph}`));
  for (const section of new Set(content.paragraphs.map(p => p.section))) {
    let batch = null;
    // Older WASM and any refused inventory retain per-node diagnostics.
    if (typeof editor.rectangleRenderingSources === "function") {
      try { batch = new Map(editor.rectangleRenderingSources(section).map(row => [row.rectangle_node, row])); }
      catch { /* Retry the original single-node queries below. */ }
    }
    let nodes;
    try { nodes = editor.rectangleNodes(section); }
    catch (error) { content.rectangleSourceErrors.push({ section, error: error.message }); continue; }
    for (const node of nodes) {
      try {
        const value = batch?.get(node) ?? editor.rectangleRenderingSource(section, node);
        if (value.rectangle_node !== node || !paragraphs.has(`${section}:${value.owner.paragraph - 1}`)) throw new Error("RectangleDisplayBindingMismatch");
        content.rectangles.push({ section, drawingNode: node, hostParagraph: value.owner.paragraph - 1, anchorUnit: value.owner.anchor_unit, anchorNode: value.owner.anchor_node, source: value.source });
      } catch (error) { content.rectangleSourceErrors.push({ section, drawingNode: node, error: error.message }); }
    }
  }
  return content;
}
