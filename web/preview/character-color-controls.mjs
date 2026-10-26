import { characterColorArg } from "../../js/character-color-args.mjs";
/** Staged explicit color request, not a cached current document color. */
export function createCharacterColorControls({
  input,
  apply,
  note,
  selected,
  request,
  availability,
  kind,
  additionalKinds = [],
  label,
  success,
}) {
  let available = false;
  const validRange = (range) =>
    range &&
    Number.isInteger(range.startUnit) &&
    Number.isInteger(range.endUnit) &&
    range.startUnit >= 0 &&
    range.endUnit <= 0xffffffff &&
    range.startUnit <= range.endUnit;
  const nonempty = (range) =>
    Array.isArray(range)
      ? range.every(validRange) && range.some((part) => part.startUnit < part.endUnit)
      : validRange(range) && range.startUnit < range.endUnit;
  const update = () => {
    const range = available ? selected() : null;
    input.disabled = apply.disabled = !nonempty(range);
  };
  const click = () => {
    const range = available ? selected() : null;
    if (!nonempty(range)) return;
    try {
      characterColorArg(input.value);
    } catch {
      note.textContent = "색은 #RRGGBB 형식으로 지정하세요.";
      return;
    }
    if (request(input.value)) update();
  };
  apply.addEventListener("click", click);
  return {
    update,
    reset() {
      available = false;
      input.value = "#000000";
      note.textContent = "";
      update();
    },
    message(message) {
      if (message.kind === "load") this.reset();
      if (message.content && !message.error) available = message.content[availability] === true;
      if (message.kind === kind || additionalKinds.includes(message.kind))
        note.textContent = message.error ? `${label} 변경 실패: ${message.error}` : success;
      update();
    },
    close() {
      apply.removeEventListener("click", click);
    },
  };
}
