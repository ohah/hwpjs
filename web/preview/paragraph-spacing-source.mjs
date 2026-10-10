// Interpret current native spacing without supplying editing defaults.
export function currentParagraphSpacing(shape) {
  const modern = shape?.modernSpacing;
  const hasModern = modern !== undefined && modern !== null;
  if (hasModern && (typeof modern !== "object" || Array.isArray(modern) || !Number.isInteger(modern.attributes) || modern.attributes < 0 || modern.attributes > 0xffffffff)) return null;
  const kind = hasModern ? modern.attributes & 31 : shape?.legacySpacingKind;
  const value = hasModern ? modern.value : shape?.legacySpacing;
  if (!Number.isInteger(kind) || kind < 0 || kind >= paragraphSpacingTypes.length) return null;
  try { paragraphSpacingArgs(paragraphSpacingTypes[kind], value); }
  catch { return null; }
  return { kind, value };
}
import { paragraphSpacingArgs, paragraphSpacingTypes } from "../../js/paragraph-spacing-args.mjs";
