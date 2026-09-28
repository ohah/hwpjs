const decoder = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });

/** Decode the private H5T1 preview wire. Every returned raw array owns its bytes. */
export function decodeHwp5Text(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  function word() {
    if (offset + 4 > bytes.length) throw new Error("InvalidHwp5TextWire");
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  }
  function raw(length) {
    if (length > bytes.length - offset) throw new Error("InvalidHwp5TextWire");
    const result = bytes.slice(offset, offset + length);
    offset += length;
    return result;
  }
  if (new TextDecoder().decode(raw(4)) !== "H5T1")
    throw new Error("InvalidHwp5TextWire");
  const versionRaw = word();
  const sectionCount = word();
  if (sectionCount > 1024) throw new Error("InvalidHwp5TextWire");
  const sections = [];
  for (let s = 0; s < sectionCount; s++) {
    const index = word();
    const paragraphCount = word();
    if (index !== s || paragraphCount > bytes.length / 20)
      throw new Error("InvalidHwp5TextWire");
    const paragraphs = [];
    for (let p = 0; p < paragraphCount; p++) {
      const nodeIndex = word();
      const parentRaw = word();
      const declaredUnits = word();
      const present = word();
      if (present > 1) throw new Error("InvalidHwp5TextWire");
      const tokenCount = word();
      if (tokenCount > bytes.length / 12) throw new Error("InvalidHwp5TextWire");
      const tokens = [];
      const textParts = [];
      for (let t = 0; t < tokenCount; t++) {
        const kind = word();
        const startUnit = word();
        const data = raw(word());
        if (kind === 0) {
          if (data.length % 2) throw new Error("InvalidHwp5TextWire");
          const value = decoder.decode(data);
          textParts.push(value);
          tokens.push({ type: "text", startUnit, text: value, raw: data });
        } else if (kind === 1 && (data.length === 2 || data.length === 16)) {
          const code = data[0] | (data[1] << 8);
          tokens.push({ type: "control", startUnit, code, raw: data });
        } else throw new Error("InvalidHwp5TextWire");
      }
      if (!present && tokenCount) throw new Error("InvalidHwp5TextWire");
      paragraphs.push({ nodeIndex, parentNodeIndex: parentRaw === 0xffffffff ? null : parentRaw, declaredUnits, textPresent: Boolean(present), text: textParts.join(""), tokens });
    }
    sections.push({ index, paragraphs });
  }
  if (offset !== bytes.length) throw new Error("InvalidHwp5TextWire");
  return {
    version: [versionRaw >>> 24, (versionRaw >>> 16) & 255, (versionRaw >>> 8) & 255, versionRaw & 255],
    sections,
  };
}
