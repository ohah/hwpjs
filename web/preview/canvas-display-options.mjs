/** Paint-only options. This object is never a Native/document DTO. */
export const DEFAULT_CANVAS_DISPLAY_OPTIONS = Object.freeze({ paragraphMarks: false });
export function canvasDisplayOptions(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError('InvalidCanvasDisplayOptions');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== 'paragraphMarks')
    throw new TypeError('InvalidCanvasDisplayOptions');
  const descriptor = Object.getOwnPropertyDescriptor(value, 'paragraphMarks');
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'boolean')
    throw new TypeError('InvalidCanvasDisplayOptions');
  return Object.freeze({ paragraphMarks: descriptor.value });
}
