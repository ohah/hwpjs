import { inlinePictureIndex, picturePositionKey } from './picture-inline.mjs';
import { hasPictureSourceErrors } from './picture-source-validation.mjs';
import { selectInlineGroupLayeredPictures } from './inline-group-layered-pictures.mjs';
import { sourceInlineCellPictureOwnership } from './source-inline-cell-picture-ownership.mjs';

// Standalone inline pictures share body reservation; grouped pictures keep their root.
export function inlineGroupPictureObjects(content, section, { sourceTables } = {}) {
  const fail = (picture, policyReason) => ({
    state: 'unavailable',
    error: 'UnsupportedInlineGroupPictures',
    policyReason,
    section: picture?.section,
    paragraph: picture?.paragraph,
    pictureNode: picture?.pictureNode,
  });
  const standalone = (content.pictures ?? []).filter(
    (row) => row.owner?.anchorNode === row.pictureNode,
  );
  const cells =
    sourceTables === undefined
      ? { state: 'selected', byNode: new Map(), remaining: standalone }
      : sourceInlineCellPictureOwnership(content, standalone, section, sourceTables);
  if (cells.state !== 'selected') return cells;
  const layered = selectInlineGroupLayeredPictures(content, cells.remaining, section);
  if (layered.state !== 'selected') return layered;
  const pictures = layered.remaining;
  const index = inlinePictureIndex({ ...content, pictures }),
    byNode = new Map(),
    hosts = new Map();
  if (index.size !== pictures.length || [...index.values()].some((row) => !row)) {
    const picture = pictures.find(
      (p) => !index.get(picturePositionKey(p.section, p.paragraph, p.anchorUnit)),
    );
    return fail(
      picture,
      picture?.geometry?.treatAsCharacter === false
        ? 'FloatingStandalonePicture'
        : 'MissingOrAmbiguousInlinePicture',
    );
  }
  for (const { picture, width, height } of index.values()) {
    if (
      picture.section !== section ||
      picture.caption != null ||
      picture.paintError ||
      hasPictureSourceErrors(picture) ||
      picture.owner.paragraph !== picture.paragraph ||
      picture.owner.anchorUnit !== picture.anchorUnit ||
      byNode.has(picture.pictureNode)
    )
      return fail(picture, 'InvalidInlinePictureOwnershipOrSource');
    const object = { objectNode: picture.pictureNode, unit: picture.anchorUnit, width, height };
    byNode.set(picture.pictureNode, { picture, object });
    const entries = hosts.get(picture.paragraph) ?? [];
    entries.push(object);
    hosts.set(picture.paragraph, entries);
  }
  return {
    state: 'measured',
    byNode,
    hosts,
    cellByNode: cells.byNode,
    layeredByNode: layered.byNode,
    zeroWidthAnchors: layered.zeroWidthAnchors,
  };
}
