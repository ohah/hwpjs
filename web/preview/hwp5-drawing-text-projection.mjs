import { hwp5DrawingTextSource } from "./hwp5-drawing-text-source.mjs";
import { validateHwp5DrawingListSources } from "../../js/hwp5-drawing-list-sources.mjs";
import { hwp5CaptionGeometry } from "./hwp5-caption-geometry.mjs";

// Ephemeral display ownership, not a rewrite of native current paragraph identities.
export function projectHwp5DrawingText(content) {
  const fail = error => ({ state: "unavailable", error });
  try {
    if (!Array.isArray(content?.paragraphs) || content.hwp5DrawingErrors?.length || content.hwp5DrawingBodyErrors?.length) throw new Error("IncompleteHwp5DrawingTextSources");
    const paragraphs = new Map(), owners = new Map(), bindings = [];
    for (const paragraph of content.paragraphs) {
      const key = `${paragraph.section}:${paragraph.paragraph}`;
      if (paragraphs.has(key)) throw new Error("AmbiguousHwp5DrawingTextParagraph");
      paragraphs.set(key, paragraph);
    }
    const lists = new Set();
    for (const body of content.hwp5DrawingBodies ?? []) {
      validateHwp5DrawingListSources([body.source]);
      const source = body.source, listKey = `${body.section}:${body.listNode}`;
      if (lists.has(listKey) || body.kind !== source.kind || body.ownerNode !== source.owner_node || body.controlNode !== source.control_node || body.listNode !== source.list_node) throw new Error("Hwp5DrawingTextSourceMismatch");
      lists.add(listKey);
      const roots = (content.hwp5Drawings ?? []).filter(row => row.section === body.section && row.controlNode === body.controlNode);
      if (roots.length !== 1) throw new Error("MissingHwp5DrawingTextRoot");
      const drawingNode = body.kind === "body" ? body.ownerNode : roots[0].componentNode;
      const text = body.kind === "body" ? hwp5DrawingTextSource(source) : null;
      const caption = body.kind === "caption" ? hwp5CaptionGeometry({ ...source.caption, attributes: source.attributes, list_node: body.listNode }) : null;
      if (!Array.isArray(body.paragraphs)) throw new Error("InvalidHwp5DrawingTextMembers");
      for (const id of body.paragraphs) {
        const key = `${body.section}:${id}`, paragraph = paragraphs.get(key);
        const flows = (content.currentParagraphFlows ?? []).filter(row => row.section === body.section && row.paragraph === id);
        if (!Number.isInteger(id) || id < 0 || id > 0xffffffff || owners.has(key) || !paragraph || paragraph.clipped
          || paragraph.tableCell || paragraph.tableCaption || flows.length !== 1 || flows[0].host !== "drawing"
          || flows[0].parent_node !== body.ownerNode || flows[0].list_node !== body.listNode || flows[0].top_level !== false) throw new Error("Hwp5DrawingTextMemberMismatch");
        owners.set(key, { kind: body.kind, drawingNode, listNode: body.listNode, captionNode: caption?.caption_node });
      }
      bindings.push({ section: body.section, kind: body.kind, controlNode: body.controlNode, drawingNode, listNode: body.listNode, text, caption });
    }
    for (const flow of content.currentParagraphFlows ?? []) if (flow.host === "drawing" && !owners.has(`${flow.section}:${flow.paragraph}`)) throw new Error("MissingHwp5DrawingTextMember");
    const projected = content.paragraphs.map(paragraph => {
      const { drawingText: oldText, drawingCaption: oldCaption, ...copy } = paragraph;
      const owner = owners.get(`${paragraph.section}:${paragraph.paragraph}`);
      if (owner) copy[owner.kind === "body" ? "drawingText" : "drawingCaption"] = { drawingNode: owner.drawingNode, listNode: owner.listNode, ...(owner.kind === "caption" ? { captionNode: owner.captionNode } : {}) };
      return copy;
    });
    return { state: "projected", paragraphs: projected, bindings };
  } catch (error) { return fail(error.message); }
}
