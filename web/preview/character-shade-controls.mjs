import { characterShadeArgs } from '../../js/character-shade-args.mjs';
export function createCharacterShadeControls({
  input,
  apply,
  remove,
  note,
  current,
  selectedState = () => null,
  selected,
  request,
}) {
  let enabled = false,
    pending = false;
  const eligible = () => {
    const range = enabled && !pending ? selected() : null;
    const valid = (part) =>
      part &&
      Number.isInteger(part.startUnit) &&
      Number.isInteger(part.endUnit) &&
      part.startUnit >= 0 &&
      part.startUnit <= part.endUnit &&
      part.endUnit <= 0xffffffff;
    return Array.isArray(range)
      ? range.every(valid) && range.some((part) => part.startUnit < part.endUnit)
      : valid(range) && range.startUnit < range.endUnit;
  };
  const update = () => {
    input.disabled = apply.disabled = remove.disabled = !eligible();
    if (current) {
      const state = enabled && !pending ? selectedState() : null;
      current.textContent =
        state === 'none'
          ? '현재 음영 없음'
          : state === 'mixed'
            ? '현재 음영 혼합'
            : typeof state === 'string' && /^#[0-9a-f]{6}$/i.test(state)
              ? `현재 음영 ${state}`
              : '현재 음영 미확인';
    }
  };
  const send = (color) => {
    if (!eligible()) return;
    try {
      characterShadeArgs(color);
    } catch {
      note.textContent = '형광펜 색을 확인하세요.';
      return;
    }
    if (request(color)) {
      pending = true;
      update();
    }
  };
  const onApply = () => send(input.value),
    onRemove = () => send(null);
  apply.addEventListener('click', onApply);
  remove.addEventListener('click', onRemove);
  return {
    update,
    reset() {
      enabled = pending = false;
      note.textContent = '';
      update();
    },
    message(message) {
      if (message.kind === 'load') this.reset();
      if (['character-shade', 'character-shade-ranges'].includes(message.kind)) {
        pending = false;
        note.textContent = message.error
          ? `형광펜 변경 실패: ${message.error}`
          : '형광펜 적용 · 원본 조판 재계산 필요';
      }
      if (message.content && !message.error)
        enabled = message.content.characterShadeAvailable === true;
      update();
    },
    close() {
      apply.removeEventListener('click', onApply);
      remove.removeEventListener('click', onRemove);
    },
  };
}
