// Exact bounded decimal sign/order SSOT. No Number(value) semantic comparisons.
// Numeric finite-f64 admission is separate; explicit exponent magnitude <=10000.
export function parseChartDecimal(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 128)
    throw Error('InvalidChartNumber');
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?)(\d+))?$/.exec(text);
  if (!match) throw Error('InvalidChartNumber');
  let exponent = 0;
  for (const digit of match[6] ?? '') {
    exponent = exponent * 10 + digit.charCodeAt(0) - 48;
    if (exponent > 10000) throw Error('InvalidChartNumber');
  }
  if (match[5] === '-') exponent = -exponent;
  const fraction = match[3] ?? match[4] ?? '';
  const digits = ((match[2] ?? '') + fraction).replace(/^0+/, '');
  return {
    negative: match[1] === '-' && digits.length !== 0,
    digits,
    scale: digits.length === 0 ? 0 : exponent - fraction.length + digits.length,
  };
}
export function compareChartDecimals(left, right) {
  const x = parseChartDecimal(left),
    y = parseChartDecimal(right);
  if (x.negative !== y.negative) return x.negative ? -1 : 1;
  let order = 0;
  if (x.digits.length === 0 || y.digits.length === 0)
    order = Math.sign(x.digits.length - y.digits.length);
  else if (x.scale !== y.scale) order = Math.sign(x.scale - y.scale);
  else
    for (let i = 0; i < Math.max(x.digits.length, y.digits.length); ++i) {
      const xd = x.digits[i] ?? '0',
        yd = y.digits[i] ?? '0';
      if (xd !== yd) {
        order = xd < yd ? -1 : 1;
        break;
      }
    }
  return order === 0 ? 0 : x.negative ? -order : order;
}
