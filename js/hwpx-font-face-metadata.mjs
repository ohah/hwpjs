import {
  decodeMetadataWire,
  metadataKeys as keys,
  metadataText as string,
} from "./font-metadata-wire.mjs";

export function decodeHwpxFontFaceMetadata(bytes) {
  const fail = () => {
    throw new Error("InvalidHwpxFontFaceMetadata");
  };
  const font = (row) =>
    keys(row, ["face", "type", "isEmbedded", "binaryItemIDRef"]) &&
    Object.values(row).every(string);
  const rows = decodeMetadataWire(bytes, "InvalidHwpxFontFaceMetadata");
  for (const row of rows) {
    if (
      !keys(row, ["format", "language", "id", "font", "substitute", "typeInfo"]) ||
      row.format !== "hwpx" ||
      !font(row.font) ||
      (row.substitute !== null && !font(row.substitute))
    )
      return fail();
    if (
      row.typeInfo !== null &&
      (!keys(row.typeInfo, [
        "familyType",
        "weight",
        "proportion",
        "contrast",
        "strokeVariation",
        "armStyle",
        "letterform",
        "midline",
        "xHeight",
      ]) ||
        !Object.values(row.typeInfo).every(string))
    )
      return fail();
  }
  return rows;
}
