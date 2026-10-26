import { inlinePictureIndex } from './picture-inline.mjs';
import { hasPictureSourceErrors } from './picture-source-validation.mjs';

// Measured native pictures stay pictures, never generated/source table aliases.
export function measureCreatedCellPictures(input) {
  const fail = () => ({ state: 'unavailable', error: 'UnsupportedCreatedSourceCellPictures' });
  if (!Array.isArray(input.pictures) || input.pictures.some(hasPictureSourceErrors)) return fail();
  const index = inlinePictureIndex({ paragraphs: input.paragraphs, pictures: input.pictures });
  if (
    index.size !== input.pictures.length ||
    [...index.values()].some((item) => !item) ||
    input.pictures.some(
      (picture) =>
        picture.caption ||
        picture.owner?.anchorNode !== picture.pictureNode ||
        picture.owner?.paragraph !== picture.paragraph ||
        picture.owner?.anchorUnit !== picture.anchorUnit,
    )
  )
    return fail();
  const hosts = new Map();
  for (const item of index.values()) {
    const picture = item.picture,
      key = `${picture.section}:${picture.paragraph}`,
      entries = hosts.get(key) ?? [];
    entries.push({
      pictureNode: picture.pictureNode,
      unit: picture.anchorUnit,
      width: item.width,
      height: item.height,
    });
    hosts.set(key, entries);
  }
  return { state: 'measured', hosts };
}
