import { readCurveTextSource } from "./curve-text-content.mjs";
export function attachDrawingTextBindings(editor, content) {
  content.drawingTextBindingErrors = [];
  content.drawingTextSnapshotErrors = [];
  content.drawings = [];
  content.curveTextSources = [];
  content.curveTextSourceErrors = [];
  const paragraphs = new Map(
    content.paragraphs.map((paragraph) => [
      `${paragraph.section}:${paragraph.paragraph}`,
      paragraph,
    ]),
  );
  for (const paragraph of content.paragraphs) {
    delete paragraph.drawingText;
    delete paragraph.drawingCaption;
  }
  for (const section of new Set(content.paragraphs.map((paragraph) => paragraph.section))) {
    let usingRequested = false;
    try {
      const allRows = editor.drawingTextBindings(section);
      const selectedDrawings = content.window
        ? new Set(
            allRows
              .filter((row) => paragraphs.has(`${section}:${row.paragraph - 1}`))
              .map((row) => row.drawingNode),
          )
        : null;
      const rows = selectedDrawings
        ? allRows.filter((row) => selectedDrawings.has(row.drawingNode))
        : allRows;
      if (rows.some((row) => !paragraphs.has(`${section}:${row.paragraph - 1}`)))
        throw new Error("DrawingTextDisplayBindingMismatch");
      const nodes = [...new Set(rows.map((row) => row.drawingNode))];
      let requested = null,
        batch = null;
      if (nodes.length && typeof editor.drawingTextRequested === "function") {
        usingRequested = true;
        const limit = editor.drawingTextRequestedMaxNodes;
        if (!Number.isInteger(limit) || limit < 1 || limit > 1024)
          throw Error("InvalidDrawingTextRequestLimit");
        requested = new Map();
        for (let start = 0; start < nodes.length; start += limit) {
          const chunk = nodes.slice(start, start + limit);
          const result = editor.drawingTextRequested(section, chunk);
          if (!Array.isArray(result) || result.length !== chunk.length)
            throw Error("InvalidDrawingTextRequested");
          for (let index = 0; index < chunk.length; index++) {
            const entry = result[index];
            if (!entry || entry.node !== chunk[index] || requested.has(entry.node))
              throw Error("InvalidDrawingTextRequested");
            if (Object.hasOwn(entry, "source") === Object.hasOwn(entry, "unavailable"))
              throw Error("InvalidDrawingTextRequested");
            if (Object.hasOwn(entry, "unavailable") && typeof entry.unavailable !== "string")
              throw Error("InvalidDrawingTextRequested");
            if (entry.unavailable === "OutOfMemory") throw Error("OutOfMemory");
            requested.set(entry.node, entry);
          }
        }
      } else if (rows.length && typeof editor.drawingTextSnapshots === "function") {
        try {
          batch = new Map(
            editor.drawingTextSnapshots(section).map((row) => [row.drawing_node, row]),
          );
        } catch {
          /* 구형 ABI의 개별 진단 경로를 그대로 유지합니다. */
        }
      }
      for (const row of rows) {
        const paragraph = paragraphs.get(`${section}:${row.paragraph - 1}`);
        if (row.kind === "caption")
          paragraph.drawingCaption = {
            drawingNode: row.drawingNode,
            captionNode: row.textNode,
            listNode: row.listNode,
          };
        else
          paragraph.drawingText = {
            drawingNode: row.drawingNode,
            textNode: row.textNode,
            listNode: row.listNode,
          };
      }
      for (const drawingNode of nodes) {
        try {
          const entry = requested?.get(drawingNode);
          if (requested && !entry) throw Error("InvalidDrawingTextRequested");
          if (entry && Object.hasOwn(entry, "unavailable")) throw Error(entry.unavailable);
          const source = requested
            ? entry.source
            : (batch?.get(drawingNode) ?? editor.drawingTextSnapshot(section, drawingNode));
          if (
            source.drawing_node !== drawingNode ||
            !paragraphs.has(`${section}:${source.paragraph - 1}`)
          )
            throw new Error("DrawingTextDisplayBindingMismatch");
          content.drawings.push({
            section,
            drawingNode,
            hostParagraph: source.paragraph - 1,
            anchorUnit: source.anchor_unit,
            source,
          });
        } catch (error) {
          if (usingRequested && error.message === "OutOfMemory") throw error;
          if (error.message === "UnsupportedDrawingTextAnchor") {
            const curve = readCurveTextSource(
              editor,
              section,
              drawingNode,
              rows.filter((row) => row.drawingNode === drawingNode),
              paragraphs,
            );
            if (curve.state === "bound") {
              content.curveTextSources.push(curve.item);
              continue;
            }
            if (curve.state === "unavailable") {
              if (usingRequested && curve.error === "OutOfMemory") throw Error("OutOfMemory");
              content.curveTextSourceErrors.push({
                section,
                curveNode: drawingNode,
                error: curve.error,
              });
            }
          }
          content.drawingTextSnapshotErrors.push({ section, drawingNode, error: error.message });
        }
      }
    } catch (error) {
      if (usingRequested && error.message === "OutOfMemory") throw error;
      content.drawingTextBindingErrors.push({ section, error: error.message });
    }
  }
  return content;
}
