/** Paint-only options. This object is never a Native/document DTO. */
export const DEFAULT_CANVAS_DISPLAY_OPTIONS = Object.freeze({
  paragraphMarks: false,
  formattingMarks: false,
  showTableGrid: false,
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
      (key) => key !== 'paragraphMarks' && key !== 'formattingMarks' && key !== 'showTableGrid',
    )
  )
    throw new TypeError('InvalidCanvasDisplayOptions');
  const descriptor = Object.getOwnPropertyDescriptor(value, 'paragraphMarks');
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'boolean')
    throw new TypeError('InvalidCanvasDisplayOptions');
  // 기존 단일 옵션 입력의 반환 형태도 유지합니다.
  const result = { paragraphMarks: descriptor.value };
  if (keys.includes('formattingMarks')) {
    const marks = Object.getOwnPropertyDescriptor(value, 'formattingMarks');
    if (!marks || !('value' in marks) || typeof marks.value !== 'boolean')
      throw new TypeError('InvalidCanvasDisplayOptions');
    result.formattingMarks = marks.value;
  }
  if (keys.includes('showTableGrid')) {
    const grid = Object.getOwnPropertyDescriptor(value, 'showTableGrid');
    if (!grid || !('value' in grid) || typeof grid.value !== 'boolean')
      throw new TypeError('InvalidCanvasDisplayOptions');
    result.showTableGrid = grid.value;
  }
  return Object.freeze(result);
}
