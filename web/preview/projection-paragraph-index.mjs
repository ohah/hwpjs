// 한 현재 snapshot의 불변 문단 배열만 인덱싱합니다. mutable 입력은 원래 검색을 유지합니다.
function paragraphLookup(maxLength, strictFind) {
  let observed;
  let sections;
  const fallback = (rows, point) =>
    rows.find((row) => row.section === point.section && row.paragraph === point.paragraph);
  return {
    find(rows, point) {
      if (rows !== observed) {
        observed = rows;
        sections = undefined;
        const coordinates = frozenCoordinates(rows, maxLength, strictFind);
        if (coordinates) {
          const next = new Map();
          for (const { section, paragraph, row } of coordinates) {
            let ordinals = next.get(section);
            if (!ordinals) next.set(section, (ordinals = new Map()));
            if (!ordinals.has(paragraph)) ordinals.set(paragraph, row);
          }
          sections = next;
        }
      }
      const section = Object.getOwnPropertyDescriptor(point ?? {}, 'section');
      const paragraph = Object.getOwnPropertyDescriptor(point ?? {}, 'paragraph');
      if (
        !sections ||
        (strictFind && !indexableFind(rows)) ||
        !section ||
        !paragraph ||
        !Object.hasOwn(section, 'value') ||
        !Object.hasOwn(paragraph, 'value') ||
        !Number.isSafeInteger(section.value) ||
        !Number.isSafeInteger(paragraph.value)
      )
        return fallback(rows, point);
      return sections.get(section.value)?.get(paragraph.value);
    },
    clear() {
      observed = undefined;
      sections = undefined;
    },
  };
}

const arrayPrototype = Array.prototype;
const arrayFind = arrayPrototype.find;
function indexableFind(rows) {
  return (
    Object.getPrototypeOf(rows) === arrayPrototype &&
    !Object.getOwnPropertyDescriptor(rows, 'find') &&
    Object.getOwnPropertyDescriptor(arrayPrototype, 'find')?.value === arrayFind
  );
}

// 기존 모델 조회의 4096개 한도와 fallback 계약은 그대로 유지한다.
export function createParagraphLookup() {
  return paragraphLookup(4096, false);
}

// 매 paint 호출 안에서만 소유한다. mutable draft는 원래 find로 검색한다.
export function createPaintParagraphLookup() {
  return paragraphLookup(Infinity, true);
}

function frozenCoordinates(rows, maxLength, strictFind) {
  if (
    !Array.isArray(rows) ||
    rows.length > maxLength ||
    !Object.isFrozen(rows) ||
    (strictFind && !indexableFind(rows))
  )
    return null;
  const coordinates = [];
  for (let index = 0; index < rows.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(rows, index);
    const row = descriptor?.value;
    const section = Object.getOwnPropertyDescriptor(row ?? {}, 'section');
    const paragraph = Object.getOwnPropertyDescriptor(row ?? {}, 'paragraph');
    if (
      !row ||
      !Object.isFrozen(row) ||
      !section ||
      !paragraph ||
      !Object.hasOwn(section, 'value') ||
      !Object.hasOwn(paragraph, 'value') ||
      !Number.isSafeInteger(section.value) ||
      section.value < 0 ||
      !Number.isSafeInteger(paragraph.value) ||
      paragraph.value < 0
    )
      return null;
    coordinates.push({ row, section: section.value, paragraph: paragraph.value });
  }
  return coordinates;
}

// 내부 body draft의 원본 증명에만 사용한다. mutable 입력을 신뢰하는 옵션은 제공하지 않는다.
export function captureImmutablePaintCoordinates(rows) {
  return frozenCoordinates(rows, Infinity, true);
}
