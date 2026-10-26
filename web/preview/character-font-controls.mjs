import { FONT_LANGUAGES } from '../../js/font-faces.mjs';

export function createCharacterFontControls({
  language,
  font,
  apply,
  note,
  category,
  selectedIds = () => null,
  selected,
  request,
}) {
  let available = false,
    faces = [];
  const validRange = (range) =>
    range &&
    Number.isInteger(range.startUnit) &&
    Number.isInteger(range.endUnit) &&
    range.startUnit >= 0 &&
    range.endUnit <= 0xffffffff &&
    range.startUnit < range.endUnit;
  const hasSelection = (ranges) =>
    Array.isArray(ranges) ? ranges.length > 0 && ranges.every(validRange) : validRange(ranges);
  const populate = () => {
    const previous = font.value;
    const ids = category?.value === 'current' ? selectedIds(language.value) : null;
    font.replaceChildren();
    for (const face of faces.filter(
      (row) =>
        row.language === language.value &&
        (category?.value !== 'current' || (Array.isArray(ids) && ids.includes(row.id))),
    )) {
      const option = font.ownerDocument.createElement('option');
      option.value = String(face.id);
      option.textContent = `${face.name ?? '이름 없음'} (${face.id})`;
      font.append(option);
    }
    if ([...font.options].some((option) => option.value === previous)) font.value = previous;
  };
  const update = () => {
    if (category?.value === 'current') populate();
    const range = available ? selected() : null;
    const enabled = hasSelection(range) && font.options.length > 0;
    language.disabled = !available;
    if (category) category.disabled = !available;
    font.disabled = apply.disabled = !enabled;
  };
  const change = () => {
    populate();
    update();
  };
  const click = () => {
    if (!available || !hasSelection(selected()) || !/^[0-9]+$/.test(font.value)) return;
    const id = Number(font.value);
    const currentIds = category?.value === 'current' ? selectedIds(language.value) : null;
    if (category?.value === 'current' && (!Array.isArray(currentIds) || !currentIds.includes(id)))
      return;
    if (!faces.some((row) => row.language === language.value && row.id === id)) return;
    if (request(language.value, id)) update();
  };
  language.addEventListener('change', change);
  category?.addEventListener('change', change);
  apply.addEventListener('click', click);
  return {
    update,
    reset() {
      available = false;
      faces = [];
      language.value = FONT_LANGUAGES[0];
      if (category) category.value = 'document';
      note.textContent = '';
      populate();
      update();
    },
    message(message) {
      if (message.kind === 'load') this.reset();
      if (message.content && !message.error) {
        available =
          message.content.characterFontAvailable === true &&
          Array.isArray(message.content.fontFaces) &&
          !message.content.fontFacesError;
        const previous = font.value;
        faces = available ? message.content.fontFaces : [];
        populate();
        if ([...font.options].some((option) => option.value === previous)) font.value = previous;
      }
      if (['character-font', 'character-font-ranges'].includes(message.kind))
        note.textContent = message.error
          ? `글꼴 변경 실패: ${message.error}`
          : '글꼴 참조 적용 · 화면 글꼴 가용성은 별도 확인이 필요합니다.';
      update();
    },
    close() {
      language.removeEventListener('change', change);
      category?.removeEventListener('change', change);
      apply.removeEventListener('click', click);
    },
  };
}
