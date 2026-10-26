import {
  decodeMetadataWire,
  metadataKeys as keys,
  metadataText as string,
} from './font-metadata-wire.mjs';

/** Optional v1 display metadata; the existing fontFaces wire stays unchanged. */
export function decodeFontFaceMetadata(bytes) {
  const fail = () => {
    throw new Error('InvalidFontFaceMetadata');
  };
  const rows = decodeMetadataWire(bytes, 'InvalidFontFaceMetadata');
  for (const row of rows) {
    if (!keys(row, ['language', 'id', 'attributes', 'substitute', 'typeInfo', 'defaultName']))
      return fail();
    if (!Number.isInteger(row.attributes) || row.attributes < 0 || row.attributes > 255)
      return fail();
    if (row.attributes & 128) {
      if (
        !keys(row.substitute, ['kind', 'name']) ||
        !Number.isInteger(row.substitute.kind) ||
        row.substitute.kind < 0 ||
        row.substitute.kind > 255 ||
        !string(row.substitute.name)
      )
        return fail();
    } else if (row.substitute !== null) return fail();
    if (row.attributes & 64) {
      if (
        !Array.isArray(row.typeInfo) ||
        row.typeInfo.length !== 10 ||
        row.typeInfo.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
      )
        return fail();
    } else if (row.typeInfo !== null) return fail();
    if (!string(row.defaultName) || (!(row.attributes & 32) && row.defaultName !== null))
      return fail();
  }
  return rows;
}
