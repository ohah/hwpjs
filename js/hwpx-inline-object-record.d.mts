export function inlineInsertRecord<const K extends readonly string[]>(
  input: unknown,
  keys: K,
): { [P in K[number]]: unknown };
