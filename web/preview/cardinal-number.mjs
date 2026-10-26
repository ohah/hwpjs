// Four-digit cardinal groups, independent of binary/XML format codes.
export function cardinalNumber(number, language) {
  if (
    !Number.isInteger(number) ||
    number < 0 ||
    number > 0xffffffff ||
    !["hangul", "hanja"].includes(language)
  )
    return null;
  const hangul = language === "hangul",
    digits = hangul ? "일이삼사오육칠팔구" : "一二三四五六七八九";
  const small = hangul ? ["", "십", "백", "천"] : ["", "十", "百", "千"];
  const large = hangul ? ["", "만", "억"] : ["", "萬", "億"];
  if (number === 0) return hangul ? "영" : "零";
  const parts = [];
  for (
    let groupIndex = 0, remaining = number;
    remaining > 0;
    groupIndex++, remaining = Math.floor(remaining / 10000)
  ) {
    const group = remaining % 10000;
    if (group === 0) continue;
    let text = "";
    for (let position = 3; position >= 0; position--) {
      const digit = Math.floor(group / 10 ** position) % 10;
      if (digit !== 0)
        text += (digit === 1 && position > 0 ? "" : digits[digit - 1]) + small[position];
    }
    parts.unshift(text + large[groupIndex]);
  }
  return parts.join("");
}
