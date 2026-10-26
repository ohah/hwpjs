import { validateHwp5PictureTailSources } from '../../js/hwp5-picture-tail-sources.mjs';
import { validateHwp5PictureSources } from '../../js/hwp5-picture-sources.mjs';
import { hwp5PictureTailLayout } from './hwp5-picture-tail-profile.mjs';
import {
  hwp5PictureAbsentVersion,
  hwp5PictureAbsentProfile,
  hwp5PictureAbsentSourceMatches,
  hwp5PictureBaseMatches,
} from './hwp5-picture-absent-tail-profile.mjs';
export function attachHwp5PictureTails(editor, content) {
  content.hwp5PictureTails = [];
  content.hwp5PictureTailErrors = [];
  content.hwp5PictureAbsentTails = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Pictures ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5PictureErrors?.some((row) => row.section === section))
        throw new Error('IncompleteHwp5PictureSources');
      const version = editor.fileVersion();
      const raw = content.hwp5Pictures.filter((row) => row.section === section);
      if (hwp5PictureAbsentVersion(version)) {
        validateHwp5PictureSources(raw.map((row) => row.source));
        const selectedProfiles = raw.map((row) => hwp5PictureAbsentProfile(version, row.source)),
          profile = selectedProfiles[0];
        if (
          !profile ||
          selectedProfiles.some((row) => row?.prefix !== profile.prefix) ||
          new Set(raw.map((row) => row.pictureNode)).size !== raw.length ||
          raw.some(
            (row) =>
              row.pictureNode !== row.source.component_node ||
              row.recordNode !== row.source.picture_node,
          )
        )
          throw new Error('UnsupportedHwp5PictureAbsentTail');
        const selected =
          profile.prefix === 'base73'
            ? raw.map((row) => row.source)
            : validateHwp5PictureSources(editor.pictureSources(section, profile.prefix));
        const byComponent = new Map(selected.map((row) => [row.component_node, row]));
        if (selected.length !== raw.length || byComponent.size !== raw.length)
          throw new Error('Hwp5PictureTailInventoryMismatch');
        const proofs = raw.map((row) => ({
          section,
          component_node: row.pictureNode,
          picture_node: row.recordNode,
          owner_node: row.source.owner_node,
          fileVersion: version,
          layout: profile.layout,
        }));
        for (const [index, row] of raw.entries()) {
          const source = byComponent.get(row.pictureNode);
          if (
            !source ||
            !hwp5PictureBaseMatches(row.source, source) ||
            !hwp5PictureAbsentSourceMatches(proofs[index], source)
          )
            throw new Error('UnsupportedHwp5PictureAbsentTail');
        }
        // Publish only after every native source matches the complete base inventory.
        for (const row of raw) row.source = byComponent.get(row.pictureNode);
        content.hwp5PictureAbsentTails.push(...proofs);
        continue;
      }
      const layout = hwp5PictureTailLayout(version);
      if (layout === null) throw new Error('UnselectedHwp5PictureTailVersion');
      const tails = validateHwp5PictureTailSources(editor.pictureTailSources(section, layout));
      if (
        tails.some((row) =>
          layout === 'effects_only'
            ? row.image_width !== null ||
              row.image_height !== null ||
              row.image_alpha !== null ||
              row.extra_bytes !== 0
            : row.image_width === null ||
              (layout === 'dimensions8' ? row.image_alpha !== null : row.image_alpha === null),
        )
      )
        throw new Error('Hwp5PictureTailLayoutMismatch');
      if (
        raw.length !== tails.length ||
        new Set(raw.map((row) => row.pictureNode)).size !== raw.length
      )
        throw new Error('Hwp5PictureTailInventoryMismatch');
      for (const tail of tails) {
        if (
          !raw.some(
            (row) =>
              row.pictureNode === tail.component_node &&
              row.recordNode === tail.picture_node &&
              row.source.owner_node === tail.owner_node,
          )
        )
          throw new Error('Hwp5PictureTailOwnerMismatch');
      }
      content.hwp5PictureTails.push(
        ...tails.map((row) => ({ ...row, section, fileVersion: version, layout })),
      );
    } catch (error) {
      content.hwp5PictureTailErrors.push({ section, error: error.message });
    }
  }
  return content;
}
