// Raw presence only: no ownership, envelope, or schema claims in unselected mode.
export function unselectedForms(bytes,records) {
  const controls=records.filter(r=>r.tag===71&&bytes.readUInt32LE(r.start)===0x666f726d).length;
  const objects=records.filter(r=>r.tag===91).length;
  return [controls,objects,controls,objects,0,0,0,0,0,0,0,0,0,0];
}
