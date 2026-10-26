import { paragraphSpacingArgs } from '../../js/paragraph-spacing-args.mjs';
import { currentParagraphSpacing } from './paragraph-spacing-source.mjs';

// A percentage step never converts fixed HWPUNIT spacing or guesses absence.
export function steppedParagraphSpacing(shape, direction) {
  if (direction !== 1 && direction !== -1) return null;
  const current = currentParagraphSpacing(shape);
  if (!current || current.kind !== 0 || current.value < 5 || current.value > 500) return null;
  const value = current.value;
  const next = Math.max(5, Math.min(500, value + direction * 5));
  if (next === value) return null;
  paragraphSpacingArgs('PERCENT', next);
  return next;
}
