// Derived display offsets only; never parse raw control payload or save it.
export function retainedTextView(paragraph) {
  // Extended anchors get a visible protected position, not a fake rendered
  // object. Native linkage validation remains the authority for eligibility.
  const retained = code => [2, 3, 4, 9, 11, 18].includes(code);
  if (!paragraph.tokens.some(t => t.type === "control" && retained(t.code))) return null;
  const chunks = [], offsets = [{ at: 0, source: 0 }];
  let source = 0, display = 0, ended = false;
  for (const t of paragraph.tokens) {
    if (ended || t.startUnit !== source) return null;
    if (t.type === "text") {
      if (t.raw.length !== t.text.length * 2) return null;
      chunks.push(t.text); display += t.text.length;
    } else if (retained(t.code) && t.raw.length === 16) {
      chunks.push(t.code === 9 ? "\t" : t.code === 3 ? "«" : t.code === 4 ? "»" : "\ufffc"); display++;
      offsets.push({ at: display, source: source + t.raw.length / 2 });
    } else if (t.code === 13 && t.raw.length === 2) ended = true;
    else return null;
    source += t.raw.length / 2;
  }
  if (!ended || source !== paragraph.declaredUnits) return null;
  return { text: chunks.join(""), offsets };
}

export function sourceTextChange(change, offsets) {
  if (!offsets) return change;
  const map = unit => {
    const row = offsets.findLast(r => r.at <= unit);
    if (!row) throw new RangeError("InvalidDisplayPosition");
    return row.source + unit - row.at;
  };
  return { ...change, startUnit: map(change.startUnit), endUnit: map(change.endUnit) };
}
