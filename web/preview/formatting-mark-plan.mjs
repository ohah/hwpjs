import { rowLeft, rowTop, rowTextTop, rowTextHeight } from './row-geometry.mjs';
import { paragraphSelectionOwner } from './paragraph-selection.mjs';
const EMPTY = Object.freeze([]);
/** 현재 본문 텍스트와 실제 행 경계가 일치할 때만 화면용 부호를 만듭니다. */
export function formattingMarkPlans(row, index, paragraph) {
  if (
    !row ||
    row.kind !== 'text' ||
    row.transform !== undefined ||
    !paragraph ||
    paragraph.clipped ||
    (paragraph.textStartUnit ?? 0) !== 0 ||
    typeof paragraph.text !== 'string' ||
    typeof row.text !== 'string' ||
    paragraphSelectionOwner(paragraph) !== `section:${paragraph.section}:body` ||
    paragraph.tableCell ||
    paragraph.drawingText ||
    paragraph.drawingCaption ||
    paragraph.createdCell ||
    row.section !== paragraph.section ||
    row.paragraph !== paragraph.paragraph ||
    !Number.isSafeInteger(row.startUnit) ||
    !Number.isSafeInteger(row.endUnit) ||
    row.startUnit < 0 ||
    row.endUnit < row.startUnit ||
    row.endUnit > paragraph.text.length ||
    paragraph.text.slice(row.startUnit, row.endUnit) !== row.text ||
    !Array.isArray(row.boundaries) ||
    row.boundaries.length < 2
  )
    return EMPTY;
  const points = row.boundaries;
  if (points[0]?.unit !== row.startUnit || points.at(-1)?.unit !== row.endUnit) return EMPTY;
  const height = rowTextHeight(row),
    left = rowLeft(row),
    y = rowTop(row, index) + rowTextTop(row) + height * 0.55;
  if (![height, left, y].every(Number.isFinite) || height <= 0) return EMPTY;
  for (let i = 0; i < points.length; i++) {
    const point = points[i],
      previous = points[i - 1];
    if (
      !point ||
      !Number.isSafeInteger(point.unit) ||
      !Number.isFinite(point.x) ||
      point.unit < row.startUnit ||
      point.unit > row.endUnit ||
      (previous && (point.unit <= previous.unit || point.x < previous.x))
    )
      return EMPTY;
  }
  const plans = [];
  // 탭이 실제로 필요한 행에서만 한 번 색인합니다. 중복은 상태와 무관하게 거부합니다.
  const duplicate = Symbol('duplicate-tab-unit');
  let tabsByUnit;
  const tabIndex = () => {
    if (tabsByUnit !== undefined) return tabsByUnit;
    tabsByUnit = new Map();
    const placements = row.tabPlacements;
    if (!Array.isArray(placements)) return tabsByUnit;
    const length = placements.length;
    for (let i = 0; i < length; i++) {
      // 기존 배열 검색처럼 빈 슬롯은 건너뛰고 상속된 슬롯은 관측합니다.
      if (!(i in placements)) continue;
      const tab = placements[i],
        unit = tab?.unit;
      if (!Number.isSafeInteger(unit) || unit < row.startUnit || unit >= row.endUnit) continue;
      tabsByUnit.set(unit, tabsByUnit.has(unit) ? duplicate : tab);
    }
    return tabsByUnit;
  };
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1],
      end = points[i],
      text = row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit),
      width = end.x - start.x;
    let kind;
    if (text === ' ' && width > 0) kind = 'space';
    else if (text === '\t' && width > 0) {
      const tab = tabIndex().get(start.unit);
      // 중복·미일치 항목의 상태 getter는 읽지 않습니다.
      if (tab === undefined || tab === duplicate || tab.state !== 'placed') continue;
      kind = 'tab';
    } else if ((text === '\n' || text === '\r' || text === '\r\n') && width === 0)
      kind = 'line-break';
    if (kind)
      plans.push(
        Object.freeze({
          kind,
          x: left + start.x,
          y,
          width,
          height,
          unit: start.unit,
          section: row.section,
          paragraph: row.paragraph,
        }),
      );
  }
  return Object.freeze(plans);
}
