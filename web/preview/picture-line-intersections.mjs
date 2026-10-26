import { pictureLineRegions } from './picture-line-regions.mjs';

// 각 그림의 어울림 정책을 원래 줄 영역에서 평가한 뒤 교집합을 구합니다.
export function intersectPictureLineRegions(line, pictures, { includeNextEvent = false } = {}) {
  const initial = pictureLineRegions(line, line, { textWrap: 2 });
  if (initial.state !== 'available') return initial;
  let regions = initial.regions;
  let nextY = Infinity;
  for (const picture of pictures) {
    const { flow } = picture;
    const rectangle = picture.flowRectangle ?? picture.rectangle;
    const result = pictureLineRegions(line, rectangle, flow);
    if (result.state !== 'available') return result;
    // 양쪽에 공간이 있어도 다른 그림과 합치면 줄 전체가 막힐 수 있습니다.
    const probe = pictureLineRegions(line, rectangle, {
      ...flow,
      textWrap: flow?.textWrap === 0 ? 1 : flow?.textWrap,
    });
    if (probe.state !== 'available') return probe;
    if (Number.isFinite(probe.nextY) && probe.nextY > line.y) nextY = Math.min(nextY, probe.nextY);
    const next = [];
    for (const a of regions)
      for (const b of result.regions) {
        const x = Math.max(a.x, b.x),
          end = Math.min(a.x + a.width, b.x + b.width);
        if (end > x) next.push({ x, width: end - x });
      }
    regions = next;
  }
  return {
    state: 'available',
    regions,
    ...((!regions.length || includeNextEvent) && Number.isFinite(nextY) ? { nextY } : {}),
  };
}
