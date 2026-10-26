// 한 현재 snapshot의 불변 문단 배열만 인덱싱합니다. mutable 입력은 원래 검색을 유지합니다.
export function createParagraphLookup() {
  let observed;
  let sections;
  const fallback = (rows, point) =>
    rows.find((row) => row.section === point.section && row.paragraph === point.paragraph);
  return {
    find(rows, point) {
      if (rows !== observed) {
        observed = rows;
        sections = undefined;
        if (Array.isArray(rows) && rows.length <= 4096 && Object.isFrozen(rows)) {
          const next = new Map();
          let valid = true;
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
            ) {
              valid = false;
              break;
            }
            let ordinals = next.get(section.value);
            if (!ordinals) next.set(section.value, (ordinals = new Map()));
            if (!ordinals.has(paragraph.value)) ordinals.set(paragraph.value, row);
          }
          if (valid) sections = next;
        }
      }
      const section = Object.getOwnPropertyDescriptor(point ?? {}, 'section');
      const paragraph = Object.getOwnPropertyDescriptor(point ?? {}, 'paragraph');
      if (
        !sections ||
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
