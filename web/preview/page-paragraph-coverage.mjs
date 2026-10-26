// 화면 순서가 아닌 현재 UTF-16 범위로 전체 문단 텍스트 보존을 검사합니다.
import { isHardLineBreak } from "./hard-line-break.mjs";
import { isUtf16Boundary } from "./utf16-boundary.mjs";
export function pageParagraphCoverage(paragraphs, rows) {
  const unavailable = () => ({ state: "unavailable", error: "IncompletePageParagraphCoverage" });
  if (!Array.isArray(paragraphs) || !Array.isArray(rows)) return unavailable();
  const owners = new Map(),
    groups = new Map();
  for (const paragraph of paragraphs) {
    if (
      !paragraph ||
      !Number.isSafeInteger(paragraph.section) ||
      paragraph.section < 0 ||
      !Number.isSafeInteger(paragraph.paragraph) ||
      paragraph.paragraph < 0 ||
      typeof paragraph.text !== "string"
    )
      return unavailable();
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (owners.has(key)) return unavailable();
    owners.set(key, paragraph);
  }
  for (const row of rows) {
    if (!row) return unavailable();
    if (row.kind !== "text") continue;
    const key = `${row.section}:${row.paragraph}`,
      owner = owners.get(key);
    if (
      !owner ||
      !Number.isSafeInteger(row.startUnit) ||
      !Number.isSafeInteger(row.endUnit) ||
      row.startUnit < 0 ||
      row.endUnit < row.startUnit ||
      row.endUnit > owner.text.length ||
      !isUtf16Boundary(owner.text, row.startUnit) ||
      !isUtf16Boundary(owner.text, row.endUnit) ||
      row.text !== owner.text.slice(row.startUnit, row.endUnit)
    )
      return unavailable();
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const [key, owner] of owners) {
    const group = groups.get(key);
    if (!group?.length || (owner.text.length === 0 && group.length !== 1)) return unavailable();
    let end = 0,
      terminal = false;
    for (const row of group.toSorted((a, b) => a.startUnit - b.startUnit)) {
      if (row.startUnit !== end) return unavailable();
      if (row.endUnit === end && owner.text.length !== 0) {
        if (terminal || end !== owner.text.length || !isHardLineBreak(owner.text.slice(-1)))
          return unavailable();
        terminal = true;
      }
      end = row.endUnit;
    }
    if (end !== owner.text.length) return unavailable();
  }
  return { state: "complete", paragraphs: owners.size };
}
