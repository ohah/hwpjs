// HWPX sampled segments in local HWPUNIT coordinates; placement belongs elsewhere.
export function curveSamplePath(source, maxSegments = 65536) {
  const fail = (error) => ({ state: 'unavailable', error });
  const coordinate = (value) =>
    Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff;
  if (
    source?.sourceOnly !== true ||
    !Number.isInteger(source.node) ||
    source.node < 0 ||
    source.node > 0xffffffff ||
    !Number.isSafeInteger(maxSegments) ||
    maxSegments < 1 ||
    maxSegments > 65536 ||
    !Array.isArray(source.segments)
  )
    return fail('InvalidCurveSampleSource');
  if (!source.segments.length) return fail('MissingCurveSampleSegments');
  if (source.segments.length > maxSegments) return fail('CurveSampleSegmentLimit');
  const commands = [],
    kinds = [];
  let start = null,
    end = null;
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const finish = () => {
    if (same(start, end)) commands.push({ kind: 'closePath' });
  };
  for (const segment of source.segments) {
    if (!segment || ![segment.x1, segment.y1, segment.x2, segment.y2].every(coordinate))
      return fail('IncompleteCurveSampleSegment');
    if (!['CURVE', 'LINE'].includes(segment.kind)) return fail('UnsupportedCurveSampleKind');
    const from = [segment.x1, segment.y1],
      to = [segment.x2, segment.y2];
    if (!same(end, from)) {
      finish();
      start = from;
      commands.push({ kind: 'moveTo', x: from[0], y: from[1] });
    }
    commands.push({ kind: 'lineTo', x: to[0], y: to[1] });
    kinds.push(segment.kind);
    end = to;
  }
  finish();
  return {
    state: 'ready',
    interpretation: 'sampled-polyline',
    node: source.node,
    commands,
    segmentKinds: kinds,
  };
}
