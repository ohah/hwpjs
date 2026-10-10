import assert from "node:assert/strict";

// Fixture oracle for C-style default %g (six significant digits), not a
// translation of the product formatter. JS supplies decimal rounding.
export function generalNumber(value) {
  assert(Number.isFinite(value));
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";
  const [digits, exponentText] = value.toExponential(5).split("e");
  const exponent = Number(exponentText);
  if (exponent < -4 || exponent >= 6) {
    const mantissa = digits.replace(/0+$/, "").replace(/\.$/, "");
    return `${mantissa}e${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  return Number(value.toPrecision(6)).toFixed(Math.max(0, 5 - exponent)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
