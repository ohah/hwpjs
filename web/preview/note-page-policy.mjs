import { normalizedNotePagePolicy } from "./normalized-note-page-policy.mjs";

// 한 구역의 원본 주석 간격과 배치를 선택합니다. 페이지 예약은 호출자가 소유합니다.
export function selectNotePagePolicy(report, section, kind) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!report || !Array.isArray(report.notes) || !Array.isArray(report.children) || !Number.isSafeInteger(section) || section < 0
    || !["footnote", "endnote"].includes(kind)) return unavailable("InvalidNotePagePolicy");
  const sourceKind = kind === "footnote" ? "foot" : "end";
  const selected = report.notes.flatMap((note, index) => note?.section_ordinal === section && note.kind === sourceKind ? [index] : []);
  if (selected.length !== 1) return unavailable("AmbiguousNotePagePolicy");
  const noteIndex = selected[0], note = report.notes[noteIndex];
  const children = report.children.filter(child => child?.note_index === noteIndex);
  const one = name => { const found = children.filter(child => child.kind === name); return found.length === 1 ? found[0] : null; };
  const spacing = one("note_spacing"), placement = one("placement"), line = one("note_line");
  if (!spacing || !placement || !line || [spacing, placement, line].some(child => !Array.isArray(child.raw) || child.raw.length !== 16 || child.direct_children !== 0)) return unavailable("AmbiguousNotePagePolicy");
  const number = (raw, signed = false) => {
    if (typeof raw !== "string" || !(signed ? /^[+-]?\d+$/ : /^\+?\d+$/).test(raw.trim())) return null;
    const value = Number(raw.trim());
    return Number.isInteger(value) && value >= (signed ? -2147483648 : 0) && value <= (signed ? 2147483647 : 0xffffffff) ? value : null;
  };
  const units = spacing.raw.slice(9, 12).map(raw => number(raw));
  const length = number(line.raw[5], true), place = placement.raw[14]?.trim(), beneath = placement.raw[15]?.trim();
  const allowed = kind === "footnote" ? ["EACH_COLUMN", "MERGED_COLUMN", "RIGHT_MOST_COLUMN"] : ["END_OF_DOCUMENT", "END_OF_SECTION"];
  if (units.some(value => value === null) || length === null || length < -1 || !allowed.includes(place)
    || !["0", "1", "false", "true"].includes(beneath)) return unavailable("UnsupportedNotePagePolicy");
  return normalizedNotePagePolicy({ section, kind, sourceNode: note.element_index,
    placement: place, beneathText: ["1", "true"].includes(beneath), between: units[0], below: units[1], above: units[2],
    length, type: line.raw[6], width: line.raw[7], color: line.raw[8] });
}
