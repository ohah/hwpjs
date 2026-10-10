// 표시 전용 관측 프로필입니다. 미지 확장 바이트의 의미를 추정하지 않습니다.
export function hwp5SectionExtensionSupported(source) {
  if (source?.extra_nonzero !== false) return false;
  if (Object.hasOwn(source, "extra_raw") && (!Array.isArray(source.extra_raw) || source.extra_raw.length !== source.extra_bytes || !Array.from(source.extra_raw).every(byte => byte === 0))) return false;
  if ([0, 6, 17].includes(source.extra_bytes)) return true;
  return source.extra_bytes === 8 && source.fileVersion === 0x05000300
    && Array.isArray(source.extra_raw) && source.extra_raw.length === 8 && Array.from(source.extra_raw).every(byte => byte === 0);
}
