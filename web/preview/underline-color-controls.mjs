import { createCharacterColorControls } from "./character-color-controls.mjs";

export function createUnderlineColorControls(options) {
  return createCharacterColorControls({
    ...options,
    availability: "characterUnderlineColorAvailable",
    kind: "character-underline-color",
    label: "밑줄 색",
    success: "밑줄 색 적용 · 위치와 선 모양 유지",
  });
}
