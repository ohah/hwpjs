const references = ['paper', 'page', 'column', 'paragraph'];

// 기준 영역의 크기는 유지하고 원점만 바꿉니다. 없는 기준을 만들어 내지 않습니다.
export function pictureReferenceSpace(boxes, origin, direction = 'to-local') {
  if (
    !origin ||
    ![origin.x, origin.y].every(Number.isFinite) ||
    !['to-local', 'to-document'].includes(direction)
  )
    return { state: 'invalid_origin' };
  const result = {},
    sign = direction === 'to-local' ? -1 : 1;
  for (const reference of references) {
    const box = boxes?.[reference];
    if (box === undefined) continue;
    if (box === null) {
      result[reference] = null;
      continue;
    }
    if (
      ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
        Number.isFinite,
      ) ||
      box.width < 0 ||
      box.height < 0
    )
      return { state: 'invalid_reference', reference };
    const x = box.x + sign * origin.x,
      y = box.y + sign * origin.y;
    if (![x, y, x + box.width, y + box.height].every(Number.isFinite))
      return { state: 'invalid_reference', reference };
    result[reference] = { ...box, x, y };
  }
  return { state: 'mapped', boxes: result };
}
