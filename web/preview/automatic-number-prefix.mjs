import { storedAutomaticNumberText } from './automatic-number-text.mjs';
import { textMeasurement } from './text-measurement.mjs';

// A retained prefix occupies display space, not a UTF-16 text boundary.
export function measureAutomaticNumberPrefix(paragraph, startUnit, measure) {
  const prefixes = paragraph.automaticNumberPrefixes ?? [];
  if (startUnit !== 0 || prefixes.length !== 1) return null;
  const text = storedAutomaticNumberText(prefixes[0].source);
  if (text === null) return null;
  return { text, ...textMeasurement(measure(text, paragraph, 0, 'number-prefix')) };
}
