/** Source-only diagnostic packet; no current layout or editing authorization. */
export function decodeInlineStringSources(bytes) {
  const fail = () => { throw new Error("InvalidHwpxInlineStringSources"); };
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return fail(); }
  const uint = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const string = s => typeof s === "string";
  if (!value || value.sourceOnly !== true || !Array.isArray(value.controls) || !Array.isArray(value.texts)) return fail();
  if (value.controls.length > 100000 || value.texts.length > 200000) return fail();
  let cursor = 0;
  const seen = new Set();
  for (const [index, control] of value.controls.entries()) {
    if (!control || !["indexmark", "dutmal"].includes(control.kind)) return fail();
    for (const key of ["section_ordinal", "element_index", "parent_element_index", "first_text", "text_count", "direct_children", "unknown_children", "other_attributes"]) if (!uint(control[key])) return fail();
    for (const key of ["parent_uri", "parent_local_name", "raw_xml", "direct_text"]) if (!string(control[key])) return fail();
    if (control.parent_element_index >= control.element_index || control.first_text !== cursor || control.text_count > value.texts.length - cursor || control.direct_children !== control.text_count + control.unknown_children) return fail();
    const identity = `${control.section_ordinal}:${control.element_index}`;
    if (seen.has(identity)) return fail();
    seen.add(identity);
    if (!control.attributes || typeof control.attributes !== "object" || Array.isArray(control.attributes)) return fail();
    for (const key of ["pos_type", "sz_ratio", "option", "style_id_ref", "alignment"]) if (control.attributes[key] !== null && !string(control.attributes[key])) return fail();
    const kinds = control.kind === "dutmal" ? ["main_text", "sub_text"] : ["first_key", "second_key"];
    for (const text of value.texts.slice(cursor, cursor + control.text_count)) {
      if (!text || text.control_index !== index || !kinds.includes(text.kind)) return fail();
      for (const key of ["element_index", "direct_children", "other_attributes"]) if (!uint(text[key])) return fail();
      if (!string(text.raw_xml) || !string(text.value) || text.element_index <= control.element_index) return fail();
      const textIdentity = `${control.section_ordinal}:${text.element_index}`;
      if (seen.has(textIdentity)) return fail();
      seen.add(textIdentity);
    }
    cursor += control.text_count;
  }
  if (cursor !== value.texts.length) return fail();
  return value;
}
