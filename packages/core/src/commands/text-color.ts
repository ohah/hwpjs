import type { SetCharacterTextColorPayload } from "./commands.ts";
import type { EditorState } from "../state/editor-state.ts";
import { validateFormattingTarget } from "./formatting.ts";
import { validateSelection } from "./selection.ts";
import { characterTextColorObservation } from "../state/text-color-state.ts";
// @ts-ignore Canonical #RRGGBB validator. Native encodes original RGB byte order.
import { characterColorArg } from "../../../../js/character-color-args.mjs";
export function textColorMessage(payload: SetCharacterTextColorPayload, state: EditorState) {
  const range = validateFormattingTarget(
    payload.target,
    state,
    true,
    "characterTextColorAvailable",
  );
  characterColorArg(payload.color);
  const row = validateSelection(payload.target, state);
  if (
    !characterTextColorObservation(
      state.content,
      row,
      payload.target.startUnit,
      payload.target.endUnit,
    ).bindingValid
  )
    throw Error("UnknownCharacterTextColor");
  return { kind: "character-text-color", ...range, color: payload.color };
}
