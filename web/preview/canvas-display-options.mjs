/** Paint-only options. This object is never a Native/document DTO. */
export const DEFAULT_CANVAS_DISPLAY_OPTIONS = Object.freeze({
  paragraphMarks: false,
  formattingMarks: false,
  showTableGrid: false,
  showTransparentTableLines: false,
});
export function canvasDisplayOptions(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError('InvalidCanvasDisplayOptions');
  const keys = Reflect.ownKeys(value);
  if (
    !keys.includes('paragraphMarks') ||
    keys.some(
      (key) => typeof key !== 'string' || !Object.hasOwn(DEFAULT_CANVAS_DISPLAY_OPTIONS, key),
    )
  )
    throw new TypeError('InvalidCanvasDisplayOptions');
  const descriptor = Object.getOwnPropertyDescriptor(value, 'paragraphMarks');
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'boolean')
    throw new TypeError('InvalidCanvasDisplayOptions');
  // 기존 단일 옵션 입력의 반환 형태도 유지합니다.
  const result = { paragraphMarks: descriptor.value };
  for (const key of keys) {
    if (key === 'paragraphMarks') continue;
    const option = Object.getOwnPropertyDescriptor(value, key);
    if (!option || !('value' in option) || typeof option.value !== 'boolean')
      throw new TypeError('InvalidCanvasDisplayOptions');
    result[key] = option.value;
  }
  return Object.freeze(result);
}
