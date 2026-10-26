import { characterFontNameArgs } from "../../js/character-font-name-args.mjs";
import { encodeCharacterRanges } from "../../js/character-range-batch.mjs";

export function createCharacterFontNameControls({
  language,
  name,
  apply,
  note,
  selected,
  request,
}) {
  let available = false;
  let rangesAvailable = false;
  let typingAvailable = false;
  const valid = () => {
    const range = selected();
    if (!range) return false;
    if (Array.isArray(range)) {
      if (!rangesAvailable || !range.some((row) => row.startUnit < row.endUnit)) return false;
      try {
        encodeCharacterRanges(range);
      } catch {
        return false;
      }
    } else if (
      !Number.isInteger(range.startUnit) ||
      !Number.isInteger(range.endUnit) ||
      range.startUnit < 0 ||
      range.endUnit > 0xffffffff ||
      range.startUnit > range.endUnit ||
      (range.startUnit === range.endUnit ? !typingAvailable : !available)
    )
      return false;
    try {
      characterFontNameArgs(language.value, name.value);
      return true;
    } catch {
      return false;
    }
  };
  const update = () => {
    name.disabled = !available && !rangesAvailable && !typingAvailable;
    apply.disabled = !valid();
  };
  const click = () => {
    const range = selected();
    if (valid() && request(language.value, name.value)) {
      if (!Array.isArray(range) && range.startUnit === range.endUnit)
        note.textContent = "다음 입력의 글꼴 지정 · 입력 전에는 문서가 변경되지 않습니다.";
      update();
    }
  };
  name.addEventListener("input", update);
  language.addEventListener("change", update);
  apply.addEventListener("click", click);
  return {
    update,
    reset() {
      available = false;
      rangesAvailable = false;
      typingAvailable = false;
      name.value = "";
      note.textContent = "";
      update();
    },
    message(message) {
      if (message.kind === "load") this.reset();
      if (message.content && !message.error)
        available = message.content.characterFontNameAvailable === true;
      if (message.content && !message.error)
        rangesAvailable = message.content.characterFontNameRangesAvailable === true;
      if (message.content && !message.error)
        typingAvailable = message.content.namedFontTextAvailable === true;
      if (
        ["character-font-name", "character-font-name-ranges", "splice-font-name"].includes(
          message.kind,
        )
      )
        note.textContent = message.error
          ? `글꼴 적용 실패: ${message.error}`
          : "글꼴 이름 적용 · 시스템 글꼴 설치는 별도입니다.";
      update();
    },
    close() {
      name.removeEventListener("input", update);
      language.removeEventListener("change", update);
      apply.removeEventListener("click", click);
    },
  };
}
