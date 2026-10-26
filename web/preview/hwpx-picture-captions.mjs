/** Native caption sources and ownership only; no XML parsing or layout fallback. */
export function attachHwpxPictureCaptions(editor, content, available) {
  const pictureIds = new Set((content.pictures ?? []).map((p) => `${p.section}:${p.pictureNode}`));
  for (const paragraph of content.paragraphs)
    if (
      paragraph.drawingCaption &&
      pictureIds.has(`${paragraph.section}:${paragraph.drawingCaption.drawingNode}`)
    )
      delete paragraph.drawingCaption;
  for (const picture of content.pictures ?? []) {
    delete picture.caption;
    delete picture.captionPartial;
  }
  content.pictureCaptionAvailable = available === true;
  content.pictureCaptionErrors = [];
  if (!content.pictureCaptionAvailable) return content;
  const pending = [],
    claimed = new Set();
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  if (paragraphs.size !== content.paragraphs.length) {
    content.pictureCaptionErrors.push({ error: 'AmbiguousPictureCaptionParagraphs' });
    return content;
  }
  for (const section of new Set((content.pictures ?? []).map((p) => p.section))) {
    try {
      const pictures = content.pictures.filter((p) => p.section === section);
      const byNode = new Map(pictures.map((p) => [p.pictureNode, p]));
      if (byNode.size !== pictures.length) throw new Error('AmbiguousPictureCaptionOwner');
      const bindings = editor.pictureCaptionBindings(section);
      for (const picture of pictures)
        picture.caption = editor.pictureCaption(section, picture.pictureNode);
      for (const binding of bindings) {
        const picture = byNode.get(binding.owner.picture_node);
        if (!picture && content.window) continue;
        const caption = picture?.caption;
        if (
          !caption ||
          caption.caption_node !== binding.owner.caption_node ||
          caption.list_node !== binding.owner.list_node
        )
          throw new Error('PictureCaptionBindingMismatch');
        const key = `${section}:${binding.paragraph - 1}`,
          paragraph = paragraphs.get(key);
        if (!paragraph && content.window) {
          picture.captionPartial = true;
          continue;
        }
        if (
          !paragraph ||
          paragraph.drawingText ||
          paragraph.drawingCaption ||
          paragraph.tableCell ||
          paragraph.tableCaption ||
          claimed.has(key)
        )
          throw new Error('PictureCaptionParagraphMismatch');
        claimed.add(key);
        pending.push({
          paragraph,
          owner: {
            drawingNode: picture.pictureNode,
            captionNode: caption.caption_node,
            listNode: caption.list_node,
          },
        });
      }
    } catch (error) {
      content.pictureCaptionErrors.push({ section, error: error.message });
    }
  }
  if (!content.pictureCaptionErrors.length)
    for (const item of pending) item.paragraph.drawingCaption = item.owner;
  return content;
}
