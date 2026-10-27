// 실제 표시 측정값만 읽으며 권위와 선택 참조는 저장하지 않습니다.
const unknown = () => Symbol('UnknownPictureMeasureDependency');
const ownData = (value, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor : null;
};
export function pictureMeasureDependency(inline, floating) {
  try {
    if (
      Object.getPrototypeOf(inline) !== Map.prototype ||
      Object.getPrototypeOf(floating) !== Set.prototype ||
      Reflect.ownKeys(inline).length ||
      Reflect.ownKeys(floating).length
    )
      return unknown();
    const rows = [];
    for (const [key, item] of Map.prototype.entries.call(inline)) {
      if (
        typeof key !== 'string' ||
        !item ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(item))
      )
        return unknown();
      const width = ownData(item, 'width'),
        height = ownData(item, 'height');
      if (!width || !height || !Number.isFinite(width.value) || !Number.isFinite(height.value))
        return unknown();
      rows.push([key, width.value, height.value]);
    }
    return {
      kind: 'picture-measure',
      inline: rows,
      floating: [...Set.prototype.values.call(floating)],
    };
  } catch {
    // Proxy/사용자 host의 descriptor·내장 collection 조회 실패는 캐시만 끕니다.
    return unknown();
  }
}
