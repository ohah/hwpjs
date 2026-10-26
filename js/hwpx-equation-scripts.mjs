import { validateEquationSources } from './hwpx-equation-sources.mjs';
export function decodeEquationScripts(bytes) {
  const fail = () => {
    throw new Error('InvalidHwpxEquationScripts');
  };
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (
    !value ||
    !Array.isArray(value.rows) ||
    !Number.isInteger(value.script_bytes) ||
    value.script_bytes < 0 ||
    value.script_bytes > 0xffffffff
  )
    return fail();
  try {
    validateEquationSources(value.rows.map((row) => row?.source));
  } catch {
    return fail();
  }
  let total = 0;
  const encode = new TextEncoder();
  for (const row of value.rows) {
    if (row.source.issue !== null) {
      if (row.value !== null) return fail();
      continue;
    }
    if (typeof row.value !== 'string' || !row.value.isWellFormed()) return fail();
    const count = encode.encode(row.value).length;
    if (count > 0xffffffff - total) return fail();
    total += count;
  }
  if (total !== value.script_bytes) return fail();
  return value;
}
