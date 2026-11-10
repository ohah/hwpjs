import { isWellFormedText } from './text-scalar.ts';

export function validateLiteralQuery(query: unknown): asserts query is string {
  if (typeof query !== 'string' || !query || !isWellFormedText(query))
    throw Error('InvalidSearchQuery');
}

/** Query-local KMP preprocessing. The optional tap counts comparisons, not time.
 * No ownership, coordinate mapping, document cache or mutation lives here. */
export function createLiteralMatcher(query: string, visit?: (phase: 'prefix' | 'scan') => void) {
  validateLiteralQuery(query);
  const prefix = new Uint32Array(query.length);
  for (let i = 1, matched = 0; i < query.length; i++) {
    for (;;) {
      visit?.('prefix');
      if (query[i] === query[matched]) {
        prefix[i] = ++matched;
        break;
      }
      if (!matched) break;
      matched = prefix[matched - 1];
    }
  }
  return function* nonoverlappingMatches(text: string): Generator<number> {
    let matched = 0;
    for (let i = 0; i < text.length; i++) {
      for (;;) {
        visit?.('scan');
        if (text[i] === query[matched]) {
          matched++;
          break;
        }
        if (!matched) break;
        matched = prefix[matched - 1];
      }
      if (matched === query.length) {
        yield i + 1 - matched;
        matched = 0;
      }
    }
  };
}
