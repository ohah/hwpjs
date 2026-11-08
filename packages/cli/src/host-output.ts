export const OBSERVATION_CHAR_LIMIT = 4 * 1024 * 1024;

export const scalar = (value: unknown): string =>
  Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? '\\u' + code.toString(16).padStart(4, '0') : character;
  }).join('');

export const line = (key: string, value: unknown): string => `${key}: ${scalar(value)}\n`;

export const warningLines = (warnings: readonly (string | object)[] = []): string =>
  warnings
    .map((warning) =>
      line(
        'warning',
        typeof warning === 'string'
          ? warning
          : Object.entries(warning)
              .map(([key, value]) => `${key}=${scalar(value)}`)
              .join(' '),
      ),
    )
    .join('');

// Shared bounded scalar metadata for observations and save/loss receipts.
export function observationLines(value: unknown, prefix = ''): string {
  const lines: string[] = [];
  let size = 0;
  function visit(item: unknown, key: string, depth: number): void {
    if (depth > 12 || lines.length >= 50000) throw Error('ObservationOutputLimit');
    if (item !== null && typeof item === 'object') {
      for (const [name, child] of Object.entries(item))
        visit(child, key ? `${key}.${name}` : name, depth + 1);
    } else {
      const text = line(key, item === null ? 'unknown' : item);
      size += text.length;
      if (size > OBSERVATION_CHAR_LIMIT) throw Error('ObservationOutputLimit');
      lines.push(text);
    }
  }
  visit(value, prefix, 0);
  return lines.join('');
}
