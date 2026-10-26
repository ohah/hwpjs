// Public test assets only. Never infer a password from a filename or path.
const known = new Map([
  ["e86aac42e3efbcc2e06cc50e628705dce710bec0c252961b7d52c87e3c6b0660", "12345"],
  ["1d54f5dd6f0716ded516252c4acac92178d23d846d04b4f76d74dd8f97ae3e3f", "12345"],
  ["93e7a62565e0f3efa4feee2812aaf518347dbbcc09d2f26a0d9385f9a4e26060", "123456"],
  ["59d4bed335b9552fe78fa68d2a56f7cfa3d586bcdeaaba839af80df13f3e08dc", "123456"],
]);
export function fixtureKnownPassword(sha256) {
  return typeof sha256 === "string" && /^[a-f0-9]{64}$/.test(sha256)
    ? known.get(sha256)
    : undefined;
}
