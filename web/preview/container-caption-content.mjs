/** Bind exact native container captions; publish only after ownership validation. */
export function attachContainerCaptions(editor, content) {
  content.containerCaptionErrors = [];
  for (const p of content.paragraphs) if (p.drawingCaption?.ownerKind === "container") delete p.drawingCaption;
  const containers = content.containers ?? [];
  if (!containers.some(c => c.source?.has_caption === true)) return content;
  const paragraphs = new Map(content.paragraphs.map(p => [`${p.section}:${p.paragraph}`, p]));
  const pending = [], claimed = new Set();
  try {
    if (paragraphs.size !== content.paragraphs.length) throw new Error("AmbiguousContainerCaptionParagraphs");
    for (const section of new Set(containers.map(c => c.section))) {
      const selected = containers.filter(c => c.section === section);
      const owners = new Map(selected.map(c => [c.containerNode, c]));
      if (owners.size !== selected.length) throw new Error("AmbiguousContainerCaptionOwner");
      if (typeof editor.containerCaptionBindings !== "function") throw new Error("HwpxContainerCaptionBindingsAbiUnavailable");
      const seen = new Set();
      for (const binding of editor.containerCaptionBindings(section)) {
        const owner = owners.get(binding.owner.container_node);
        if (!owner && content.window) continue;
        const caption = owner?.source?.caption;
        if (!owner?.source?.has_caption || !caption || caption.caption_node !== binding.owner.caption_node || caption.list_node !== binding.owner.list_node) throw new Error("ContainerCaptionBindingMismatch");
        const key = `${section}:${binding.paragraph - 1}`, paragraph = paragraphs.get(key);
        if (!paragraph || paragraph.drawingCaption || paragraph.drawingText || paragraph.tableCell || paragraph.tableCaption || claimed.has(key)) throw new Error("ContainerCaptionParagraphMismatch");
        claimed.add(key); seen.add(owner.containerNode);
        pending.push({ paragraph, binding: { ownerKind: "container", drawingNode: owner.containerNode, captionNode: caption.caption_node, listNode: caption.list_node } });
      }
      if (selected.some(c => c.source?.has_caption === true && !seen.has(c.containerNode))) throw new Error("IncompleteContainerCaptionOwnership");
    }
  } catch (error) { content.containerCaptionErrors.push({ error: error.message }); }
  if (!content.containerCaptionErrors.length) for (const item of pending) item.paragraph.drawingCaption = item.binding;
  return content;
}
