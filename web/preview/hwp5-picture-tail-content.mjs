import { validateHwp5PictureTailSources } from "../../js/hwp5-picture-tail-sources.mjs";
import { validateHwp5PictureSources } from "../../js/hwp5-picture-sources.mjs";
import { hwp5PictureTailLayout } from "./hwp5-picture-tail-profile.mjs";
export function attachHwp5PictureTails(editor, content) {
  content.hwp5PictureTails = [];
  content.hwp5PictureTailErrors = [];
  content.hwp5PictureAbsentTails = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Pictures ?? []).map(row => row.section))) {
    try {
      if (content.hwp5PictureErrors?.some(row => row.section === section)) throw new Error("IncompleteHwp5PictureSources");
      const version = editor.fileVersion();
      const raw = content.hwp5Pictures.filter(row => row.section === section);
      if (version === 0x05000107) {
        validateHwp5PictureSources(raw.map(row => row.source));
        if (new Set(raw.map(row => row.pictureNode)).size !== raw.length || raw.some(row => row.source.extra_bytes !== 0
          || row.source.border_opacity !== null || row.source.instance_id !== null || row.pictureNode !== row.source.component_node || row.recordNode !== row.source.picture_node)) throw new Error("UnsupportedHwp5PictureAbsentTail");
        content.hwp5PictureAbsentTails.push(...raw.map(row => ({ section, component_node: row.pictureNode, picture_node: row.recordNode,
          owner_node: row.source.owner_node, fileVersion: version, layout: "absent_base73" })));
        continue;
      }
      const layout = hwp5PictureTailLayout(version);
      if (layout === null) throw new Error("UnselectedHwp5PictureTailVersion");
      const tails = validateHwp5PictureTailSources(editor.pictureTailSources(section, layout));
      if (tails.some(row => row.image_width === null || (layout === "dimensions8" ? row.image_alpha !== null : row.image_alpha === null))) throw new Error("Hwp5PictureTailLayoutMismatch");
      if (raw.length !== tails.length || new Set(raw.map(row => row.pictureNode)).size !== raw.length) throw new Error("Hwp5PictureTailInventoryMismatch");
      for (const tail of tails) {
        if (!raw.some(row => row.pictureNode === tail.component_node && row.recordNode === tail.picture_node && row.source.owner_node === tail.owner_node)) throw new Error("Hwp5PictureTailOwnerMismatch");
      }
      content.hwp5PictureTails.push(...tails.map(row => ({ ...row, section, fileVersion: version, layout })));
    } catch (error) { content.hwp5PictureTailErrors.push({ section, error: error.message }); }
  }
  return content;
}
