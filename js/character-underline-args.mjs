export function characterUnderlineArg(kind) {
  const values = ["none", "bottom", "center", "top"];
  const value = values.indexOf(kind);
  if (value < 0) throw new TypeError("InvalidCharacterUnderlineKind");
  return value;
}
