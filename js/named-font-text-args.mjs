import { characterFontNameArgs } from "./character-font-name-args.mjs";
import { textTransactionArgs } from "./text-transaction-args.mjs";

export function namedFontTextArgs({ section, paragraph, startUnit, endUnit, text, language, name }) {
  const { positions, bytes } = textTransactionArgs({ section, paragraph, startUnit, endUnit, text });
  return { positions, bytes, font: characterFontNameArgs(language, name) };
}
