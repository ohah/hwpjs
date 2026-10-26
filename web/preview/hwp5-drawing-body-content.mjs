import { validateHwp5DrawingListSources } from "../../js/hwp5-drawing-list-sources.mjs";

export function attachHwp5DrawingBodies(editor, content) {
  content.hwp5DrawingBodies = [];
  content.hwp5DrawingBodyErrors = [];
  if (!editor) return content;
  const flows = content.currentParagraphFlows ?? [];
  const sections = new Set([
    ...(content.hwp5Drawings ?? []).map((row) => row.section),
    ...flows.filter((row) => row.host === "drawing").map((row) => row.section),
  ]);
  for (const section of sections) {
    try {
      if (content.hwp5DrawingErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5DrawingSources");
      const sources = validateHwp5DrawingListSources(editor.drawingListSources(section)),
        prepared = [];
      const members = flows.filter((row) => row.section === section && row.host === "drawing");
      const paragraphs = content.paragraphs.filter((row) => row.section === section);
      if (
        new Set(members.map((row) => row.paragraph)).size !== members.length ||
        new Set(paragraphs.map((row) => row.paragraph)).size !== paragraphs.length
      )
        throw new Error("AmbiguousHwp5DrawingBody");
      for (const source of sources) {
        if (
          !content.hwp5Drawings?.some(
            (row) => row.section === section && row.controlNode === source.control_node,
          )
        )
          throw new Error("MissingHwp5DrawingBodyControl");
        const body = members.filter(
          (row) => row.parent_node === source.owner_node && row.list_node === source.list_node,
        );
        if (
          (source.paragraph_count > 0 && !body.length) ||
          body.some((row) => !paragraphs.some((p) => p.paragraph === row.paragraph && !p.clipped))
        )
          throw new Error("MissingHwp5DrawingBodyParagraph");
        prepared.push({
          section,
          kind: source.kind,
          controlNode: source.control_node,
          ownerNode: source.owner_node,
          listNode: source.list_node,
          paragraphs: body.map((row) => row.paragraph),
          source,
        });
      }
      if (
        members.some(
          (row) =>
            !prepared.some(
              (body) => body.ownerNode === row.parent_node && body.listNode === row.list_node,
            ),
        )
      )
        throw new Error("IncompleteHwp5DrawingBodies");
      content.hwp5DrawingBodies.push(...prepared);
    } catch (error) {
      content.hwp5DrawingBodyErrors.push({ section, error: error.message });
    }
  }
  return content;
}
