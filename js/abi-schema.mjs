// Authoritative ABI schema. tools/generate-abi.mjs derives the Zig declarations.
// Breaking changes require a version bump and an independently pinned contract test.
export const ABI_VERSION = 2;
export const FIELD = Object.freeze({ name: 0, path: 1, content: 2, clsid: 3 });
export const VALUE = Object.freeze({
  kind: 0,
  color: 1,
  left: 2,
  right: 3,
  child: 4,
  state: 5,
  created: 6,
  modified: 7,
  start: 8,
  size: 9,
});
export const REQUIRED_FUNCTIONS = Object.freeze([
  "hwpjs_abi_version",
  "cfb_alloc",
  "cfb_free",
  "cfb_open",
  "cfb_close",
  "cfb_error_ptr",
  "cfb_error_len",
  "cfb_count",
  "cfb_find",
  "cfb_find_snapshot",
  "cfb_field_ptr",
  "cfb_field_len",
  "cfb_value",
  "cfb_sector_count",
  "cfb_raw_ptr",
  "cfb_raw_len",
]);
