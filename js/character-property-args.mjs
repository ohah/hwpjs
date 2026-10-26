export function characterPropertyArgs(properties) {
  const names = ["size", "bold", "italic"];
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties) ||
    Object.keys(properties).some((key) => !names.includes(key))
  )
    throw new TypeError("InvalidCharacterProperties");
  let mask = 0;
  const values = names.map((key, index) => {
    if (!Object.hasOwn(properties, key) || properties[key] === null) return 0;
    const value = properties[key];
    if (key === "size") {
      if (!Number.isInteger(value) || value < 0 || value > 409600)
        throw new RangeError("InvalidCharacterSize");
    } else if (typeof value !== "boolean") throw new TypeError("InvalidCharacterProperties");
    mask |= 1 << index;
    return key === "size" ? value : Number(value);
  });
  return [mask, ...values];
}
