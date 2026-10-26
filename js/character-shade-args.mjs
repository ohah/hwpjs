import { characterColorArg } from './character-color-args.mjs';

/** null explicitly removes shading; undefined is never an editing default. */
export function characterShadeArgs(color) {
  return color === null ? [0, 0] : [1, characterColorArg(color)];
}
