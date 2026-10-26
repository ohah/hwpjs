// HWP5 table134 mapping; XML enum ordinal is not the binary code for SYMBOL/USER_CHAR.
import { cardinalNumber } from "./cardinal-number.mjs";
const binaryNames = Object.freeze([
  "DIGIT",
  "CIRCLED_DIGIT",
  "ROMAN_CAPITAL",
  "ROMAN_SMALL",
  "LATIN_CAPITAL",
  "LATIN_SMALL",
  "CIRCLED_LATIN_CAPITAL",
  "CIRCLED_LATIN_SMALL",
  "HANGUL_SYLLABLE",
  "CIRCLED_HANGUL_SYLLABLE",
  "HANGUL_JAMO",
  "CIRCLED_HANGUL_JAMO",
  "HANGUL_PHONETIC",
  "IDEOGRAPH",
  "CIRCLED_IDEOGRAPH",
  "DECAGON_CIRCLE",
  "DECAGON_CIRCLE_HANJA",
]);
export const hwp5NumberFormat = (code) =>
  Number.isInteger(code) && code >= 0 && code <= 255
    ? (binaryNames[code] ?? (code === 0x80 ? "SYMBOL" : code === 0x81 ? "USER_CHAR" : null))
    : null;
const finite = Object.freeze({
  HANGUL_SYLLABLE: "가나다라마바사아자차카타파하",
  HANGUL_JAMO: "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ",
  DECAGON_CIRCLE: "갑을병정무기경신임계",
  DECAGON_CIRCLE_HANJA: "甲乙丙丁戊己庚辛壬癸",
});
const circles = Object.freeze({
  CIRCLED_DIGIT: [0x2460, 20],
  CIRCLED_LATIN_CAPITAL: [0x24b6, 26],
  CIRCLED_LATIN_SMALL: [0x24d0, 26],
  CIRCLED_HANGUL_SYLLABLE: [0x326e, 14],
  CIRCLED_HANGUL_JAMO: [0x3260, 14],
  CIRCLED_IDEOGRAPH: [0x3280, 10],
});

export function formatNumber(number, kind, symbol = "") {
  if (!Number.isInteger(number) || number < 0 || number > 0xffffffff || typeof kind !== "string")
    return null;
  if (kind === "DIGIT") return String(number);
  if (kind === "HANGUL_PHONETIC" || kind === "IDEOGRAPH")
    return cardinalNumber(number, kind === "HANGUL_PHONETIC" ? "hangul" : "hanja");
  if (number === 0) return null;
  if (kind === "USER_CHAR")
    return typeof symbol === "string" &&
      [...symbol].length === 1 &&
      ![...symbol].some((char) => char.codePointAt(0) >= 0xd800 && char.codePointAt(0) <= 0xdfff)
      ? symbol
      : null;
  if (Object.hasOwn(circles, kind)) {
    const [start, count] = circles[kind];
    return number <= count ? String.fromCodePoint(start + number - 1) : null;
  }
  if (Object.hasOwn(finite, kind)) return [...finite[kind]][number - 1] ?? null;
  if (["LATIN_CAPITAL", "LATIN_SMALL"].includes(kind)) {
    const base = kind === "LATIN_CAPITAL" ? 65 : 97;
    let result = "",
      remaining = number;
    while (remaining > 0) {
      remaining--;
      result = String.fromCharCode(base + (remaining % 26)) + result;
      remaining = Math.floor(remaining / 26);
    }
    return result;
  }
  if (["ROMAN_CAPITAL", "ROMAN_SMALL"].includes(kind)) {
    if (number > 3999) return null;
    let result = "",
      remaining = number;
    for (const [value, text] of [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ]) {
      while (remaining >= value) {
        result += text;
        remaining -= value;
      }
    }
    return kind === "ROMAN_SMALL" ? result.toLowerCase() : result;
  }
  return null;
}
