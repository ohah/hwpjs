import { characterFontArgs } from "./character-font-args.mjs";

export function characterFontNameArgs(language, name) {
  const index = characterFontArgs(language, 0)[0];
  if (typeof name !== "string") throw new TypeError("InvalidFontName");
  for (let i = 0; i < name.length; i++) {
    const unit = name.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = name.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new RangeError("InvalidFontName");
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new RangeError("InvalidFontName");
  }
  const bytes = new TextEncoder().encode(name);
  if (bytes.length === 0) throw new RangeError("InvalidFontName");
  if (bytes.length > 4096) throw new RangeError("LimitExceeded");
  return { language: index, bytes };
}
