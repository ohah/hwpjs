// Derived display offsets only; never parse raw control payload or save it.
export function retainedTextView(paragraph) {
  // Extended anchors get a visible protected position, not a fake rendered
  // object. Native linkage validation remains the authority for eligibility.
  const retained = code => [2, 3, 4, 8, 9, 11, 16, 17, 18, 21, 22, 23].includes(code);
  if (!paragraph.tokens.some(t => t.type === "control" && (retained(t.code) || t.code === 10 || t.code === 24 || t.code === 30 || t.code === 31))) return null;
  const chunks = [], offsets = [{ at: 0, source: 0 }];
  let source = 0, display = 0, ended = false;
  for (const t of paragraph.tokens) {
    if (ended || t.startUnit !== source) return null;
    if (t.type === "text") {
      if (t.raw.length !== t.text.length * 2) return null;
      chunks.push(t.text); display += t.text.length;
    } else if (t.code === 10 && t.raw.length === 2) {
      chunks.push("\n"); display++;
    } else if (t.code === 24 && t.raw.length === 2) {
      // Keep a distinct soft-hyphen editing unit; never replace source with '-'.
      chunks.push("\u00ad"); display++;
    } else if ((t.code === 30 || t.code === 31) && t.raw.length === 2) {
      // A nonbreaking display placeholder, not a claim of Hangul fixed-space metrics.
      // The source control remains one unit and native deletion policy is unchanged.
      chunks.push("\u00a0"); display++;
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

/** Exact raw boundary -> visible boundary; never maps inside protected anchors. */
export function sourceDisplayPosition(unit, offsets, displayLength) {
  if (!Number.isInteger(unit) || unit < 0 || !Number.isInteger(displayLength) || displayLength < 0 || !Array.isArray(offsets) || offsets.length === 0) throw new RangeError("InvalidSourceDisplayPosition");
  let previous;
  for (const row of offsets) {
    if (!row || !Number.isInteger(row.at) || !Number.isInteger(row.source) || row.at < 0 || row.source < 0 || previous && (row.at <= previous.at || row.source <= previous.source)) throw new RangeError("InvalidSourceDisplayPosition");
    previous = row;
  }
  if (offsets[0].at !== 0 || offsets[0].source !== 0) throw new RangeError("InvalidSourceDisplayPosition");
  const index = offsets.findLastIndex(row => row.source <= unit);
  if (index < 0) throw new RangeError("InvalidSourceDisplayPosition");
  const row = offsets[index], result = row.at + unit - row.source, next = offsets[index + 1];
  if (result > displayLength || next && result >= next.at && unit < next.source) throw new RangeError("InvalidSourceDisplayPosition");
  return result;
}
