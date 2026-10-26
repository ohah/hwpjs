// 표시 전용 관측 프로필입니다. 미지 확장 바이트의 의미를 추정하지 않습니다.
const observedZeroEightVersions = new Set([
  0x05000204, 0x05000205, 0x05000302, 0x05000303, 0x05000304,
]);

export function hwp5SectionExtensionUnverified(source) {
  return (
    source?.extra_bytes === 8 &&
    observedZeroEightVersions.has(source.fileVersion) &&
    hwp5SectionExtensionSupported(source)
  );
}

export function hwp5SectionExtensionSupported(source, retainedMemoLists = 0) {
  if (source?.extra_nonzero === true && memoStyleOnly(source, retainedMemoLists)) return true;
  if (source?.extra_nonzero !== false) return false;
  if (
    Object.hasOwn(source, "extra_raw") &&
    (!Array.isArray(source.extra_raw) ||
      source.extra_raw.length !== source.extra_bytes ||
      !Array.from(source.extra_raw).every((byte) => byte === 0))
  )
    return false;
  if ([0, 6, 17].includes(source.extra_bytes)) return true;
  return (
    source.extra_bytes === 8 &&
    (source.fileVersion === 0x05000300 || observedZeroEightVersions.has(source.fileVersion)) &&
    Array.isArray(source.extra_raw) &&
    source.extra_raw.length === 8 &&
    Array.from(source.extra_raw).every((byte) => byte === 0)
  );
}

// The caller may isolate fully validated memo lists in the editor annotation
// pane. Counts remain unchanged in the stored source; other bytes stay strict.
function memoStyleOnly(source, retainedMemoLists) {
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  if (
    !uint(source.fileVersion) ||
    source.fileVersion < 0x05000105 ||
    !uint(source.language, 65535) ||
    source.extra_bytes !== 17 ||
    !Array.isArray(source.extra_raw) ||
    source.extra_raw.length !== 17 ||
    !Array.from(source.extra_raw).every(
      (byte, index) => uint(byte, 255) && (index === 4 || index === 5 || byte === 0),
    ) ||
    !uint(retainedMemoLists) ||
    source.memo_list_count !== retainedMemoLists ||
    !uint(source.memo_shape_count)
  )
    return false;
  const extension = source.observed_extension,
    id = source.extra_raw[4] | (source.extra_raw[5] << 8);
  return (
    id > 0 &&
    id <= source.memo_shape_count &&
    extension?.memo_shape_id_ref === id &&
    [
      "leading_count_raw",
      "flags_raw",
      "unknown_flags",
      "text_direction_raw",
      "line_number_restart_raw",
      "line_number_count_by",
      "line_number_distance_raw",
      "line_number_start",
    ].every((key) => extension[key] === 0) &&
    extension.text_direction === "HORIZONTAL" &&
    extension.text_vertical_width_head === false
  );
}
