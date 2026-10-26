// Explicit RHWP reference policy for straight two-terminal control paths.
export function connectorReferencePath(source, rendering) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    source?.sourceOnly !== true ||
    rendering?.sourceOnly !== true ||
    source.node !== rendering.node ||
    rendering.coordinateSpace !== 'renderingInfo'
  )
    return fail('ConnectorPathBindingMismatch');
  const raw = source.geometry;
  if (!raw || !['STRAIGHT_NOARROW', 'STRAIGHT_ONEWAY', 'STRAIGHT_BOTH'].includes(raw.raw_type))
    return fail('UnsupportedConnectorPathType');
  let points;
  if (!raw.controls_present && raw.controls?.length === 0) points = rendering.endpoints;
  else if (
    raw.controls?.length === 2 &&
    raw.controls[0].control_type === '3' &&
    raw.controls[1].control_type === '26' &&
    rendering.controls?.length === 2
  )
    points = rendering.controls;
  else return fail('UnsupportedConnectorControlPath');
  if (
    !Array.isArray(points) ||
    points.length !== 2 ||
    !points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
  )
    return fail('InvalidConnectorPathPoints');
  return { state: 'planned', policy: 'rhwp_reference', endpoints: points.map((p) => p.slice()) };
}
