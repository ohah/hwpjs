import { validateHwp5PictureShadowSource } from "./hwp5-picture-shadow-source.mjs";
export function pictureTailLayoutArg(layout) {
  const value = ["effects_only", "dimensions8", "with_alpha9"].indexOf(layout);
  if (value < 0) throw new Error("InvalidPictureTailLayout");
  return value;
}
export function validateHwp5PictureTailSources(rows) {
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5PictureTailSources");
  const components = new Set(), pictures = new Set();
  for (const row of rows) {
    if (!row || !["component_node", "owner_node", "picture_node", "instance_id", "effects_flags", "extra_bytes"].every(key => uint(row[key]))
      || row.owner_node >= row.component_node || row.component_node >= row.picture_node || components.has(row.component_node) || pictures.has(row.picture_node)
      || !Number.isInteger(row.border_opacity) || row.border_opacity < 0 || row.border_opacity > 255 || row.effects_flags & ~15
      || (row.image_width === null) !== (row.image_height === null) || row.image_width !== null && (!uint(row.image_width) || !uint(row.image_height))
      || row.image_alpha !== null && (!Number.isInteger(row.image_alpha) || row.image_alpha < -128 || row.image_alpha > 127 || row.image_width === null)) throw new Error("InvalidHwp5PictureTailSources");
    validateHwp5PictureShadowSource(row.shadow, row.effects_flags);
    components.add(row.component_node); pictures.add(row.picture_node);
  }
  return rows;
}
export function decodeHwp5PictureTailSources(bytes) {
  return validateHwp5PictureTailSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
