import { CHARACTER_EFFECTS } from "../../js/character-effect-args.mjs";
export function createCharacterEffectControls({
  buttons,
  note,
  selectedState,
  request,
  availability = "characterEffectAvailable",
  rangesAvailability = null,
  canRequest = () => true,
}) {
  let enabled = false,
    pending = false,
    closed = false;
  const entries = [...buttons].filter((button) =>
    CHARACTER_EFFECTS.includes(button.dataset.effect),
  );
  const update = () => {
    for (const button of entries) {
      const state =
        enabled && !pending && !closed && canRequest()
          ? selectedState(button.dataset.effect)
          : null;
      button.disabled = ![true, false, "mixed"].includes(state);
      button.setAttribute("aria-pressed", state === "mixed" ? "mixed" : String(state === true));
    }
  };
  const handlers = entries.map((button) => {
    const click = () => {
      if (!enabled || pending || closed || button.disabled || !canRequest()) return;
      const state = selectedState(button.dataset.effect);
      if (![true, false, "mixed"].includes(state)) return;
      if (request(button.dataset.effect, state !== true)) {
        pending = true;
        update();
      }
    };
    button.addEventListener("click", click);
    return [button, click];
  });
  update();
  return {
    update,
    reset() {
      enabled = pending = false;
      note.textContent = "";
      update();
    },
    message(message) {
      if (message.kind === "load") this.reset();
      if (["character-effect", "character-effect-ranges"].includes(message.kind)) {
        pending = false;
        note.textContent = message.error
          ? `글자 효과 변경 실패: ${message.error}`
          : "글자 효과 저장값 적용 · 화면 효과와 원본 조판은 별도입니다.";
      }
      if (message.content && !message.error)
        enabled =
          message.content[availability] === true ||
          (rangesAvailability !== null && message.content[rangesAvailability] === true);
      update();
    },
    close() {
      closed = true;
      for (const [button, click] of handlers) button.removeEventListener("click", click);
      update();
    },
  };
}
