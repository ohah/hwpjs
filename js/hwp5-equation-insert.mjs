import { inlineInsertRecord, checkedEquationInsertOptions } from './hwpx-inline-object-insert.mjs';
// Transport-only validation. Native owns host admission, records, IDs and history.
export function checkedHwp5EquationInsertOptions(input) {
  const p = inlineInsertRecord(input, [
    'script',
    'width',
    'height',
    'baseLine',
    'baseUnit',
    'version',
    'font',
    'colorRgb',
    'lineMode',
  ]);
  if (
    !Number.isInteger(p.baseLine) ||
    p.baseLine < -32768 ||
    p.baseLine > 32767 ||
    !Number.isInteger(p.colorRgb) ||
    p.colorRgb < 0 ||
    p.colorRgb > 0xffffff ||
    typeof p.lineMode !== 'boolean'
  )
    throw Error('InvalidHwp5EquationInsertOptions');
  const { colorRgb, lineMode, baseLine, ...shared } = p;
  const options = checkedEquationInsertOptions({ ...shared, baseLine: 0 });
  if (
    !options.script.length ||
    options.script.length > 65535 ||
    options.version !== 'Equation Version 60' ||
    options.font !== 'HYhwpEQ'
  )
    throw Error('UnsupportedEquationCreateProfile');
  return { ...options, baseLine, colorRgb, lineMode };
}
