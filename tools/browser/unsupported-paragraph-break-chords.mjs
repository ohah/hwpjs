import { paragraphBreakShortcut } from "../../web/preview/paragraph-break-shortcut.mjs";

// Negative browser probes only. Supported breaks have their own save/history audit.
export function unsupportedParagraphBreakChords(available) {
  if (typeof available !== "boolean") throw new TypeError("InvalidParagraphBreakCapability");
  const chords = [
    "Control+Enter",
    "Meta+Enter",
    "Control+Shift+Enter",
    "Meta+Shift+Enter",
    "Alt+Enter",
    "Control+Alt+Enter",
    "Meta+Alt+Enter",
    "Control+Meta+Enter",
    "Control+Meta+Shift+Enter",
  ];
  return chords.flatMap((chord) => {
    const keys = chord.split("+");
    const event = {
      key: "Enter",
      ctrlKey: keys.includes("Control"),
      metaKey: keys.includes("Meta"),
      altKey: keys.includes("Alt"),
      shiftKey: keys.includes("Shift"),
    };
    return available && paragraphBreakShortcut(event) !== null
      ? []
      : [[chord, event.ctrlKey, event.metaKey, event.altKey, event.shiftKey]];
  });
}
