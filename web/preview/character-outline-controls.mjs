import { hwp5CharacterOutlineArg } from "../../js/character-outline-args.mjs";
import { encodeCharacterRanges } from "../../js/character-range-batch.mjs";
export function createCharacterOutlineControls({
  kind,
  apply,
  current,
  note,
  selected,
  selectedState,
  request,
  canRequestKind = () => true,
}) {
  let enabled = false,
    pending = false,
    closed = false;
  let extended = false;
  const supported = (value) => {
    try {
      return (hwp5CharacterOutlineArg(value) <= 1 || extended) && canRequestKind(value) === true;
    } catch {
      return false;
    }
  };
  const eligible = () => {
    const range = enabled && !pending && !closed ? selected() : null;
    if (Array.isArray(range)) {
      try {
        encodeCharacterRanges(range);
      } catch {
        return false;
      }
      return range.some((part) => part.startUnit < part.endUnit);
    }
    return (
      range &&
      !Array.isArray(range) &&
      Number.isInteger(range.startUnit) &&
      Number.isInteger(range.endUnit) &&
      range.startUnit >= 0 &&
      range.startUnit < range.endUnit &&
      range.endUnit <= 0xffffffff
    );
  };
  const update = () => {
    kind.disabled = !eligible();
    apply.disabled = kind.disabled || !supported(kind.value);
    for (const option of kind.options ?? []) option.disabled = !supported(option.value);
    const labels = {
      absent: "원본 요소 없음",
      none: "없음",
      solid: "실선",
      dot: "점선",
      thick: "굵은 실선",
      dash: "파선",
      "dash-dot": "일점쇄선",
      "dash-dot-dot": "이점쇄선",
      other: "다른 원본 종류",
      mixed: "혼합",
    };
    const state = enabled && !pending && !closed ? selectedState() : null;
    current.textContent = `현재 외곽선 ${Object.hasOwn(labels, state) ? labels[state] : "미확인"}`;
  };
  const click = () => {
    if (!eligible()) return;
    try {
      hwp5CharacterOutlineArg(kind.value);
    } catch {
      note.textContent = "외곽선 종류를 확인하세요.";
      return;
    }
    if (!supported(kind.value)) {
      note.textContent = "현재 선택에서는 이 외곽선 종류를 지원하지 않습니다.";
      return;
    }
    if (request(kind.value)) {
      pending = true;
      update();
    }
  };
  apply.addEventListener("click", click);
  update();
  kind.addEventListener?.("change", update);
  return {
    update,
    reset() {
      enabled = pending = extended = false;
      note.textContent = "";
      update();
    },
    message(message) {
      if (message.kind === "load") this.reset();
      if (["character-outline", "character-outline-ranges"].includes(message.kind)) {
        pending = false;
        note.textContent = message.error
          ? `외곽선 변경 실패: ${message.error}`
          : "외곽선 적용 · 미리보기와 원본 조판은 별도입니다.";
      }
      if (message.content && !message.error) {
        enabled =
          message.content.characterOutlineAvailable === true ||
          message.content.characterOutlineRangesAvailable === true;
        extended =
          message.content.characterOutlineExtendedAvailable === true ||
          message.content.characterOutlineRangesExtendedAvailable === true;
      }
      update();
    },
    close() {
      closed = true;
      apply.removeEventListener("click", click);
      kind.removeEventListener?.("change", update);
      update();
    },
  };
}
