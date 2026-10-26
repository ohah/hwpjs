/** Pixel-coordinate kernel. Source units, section defaults and text shaping belong to callers. */
export function nextTabPlacement(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    return { state: 'unavailable', error: 'InvalidTabStopGeometry' };
  const {
    x,
    stops,
    rightEdge,
    defaultInterval = null,
    gridOrigin = 0,
    autoLeftPosition = null,
    autoRight = false,
    followingWidth = null,
    decimalWidth = null,
    constrainRightLeader = false,
  } = options;
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const nonnegative = (value) => finite(value) && value >= 0;
  const missing = (error) => ({ state: 'unavailable', error });
  if (
    !finite(x) ||
    !finite(gridOrigin) ||
    !nonnegative(rightEdge) ||
    !Array.isArray(stops) ||
    typeof autoRight !== 'boolean' ||
    typeof constrainRightLeader !== 'boolean' ||
    (defaultInterval !== null && (!finite(defaultInterval) || defaultInterval <= 0)) ||
    (autoLeftPosition !== null && !finite(autoLeftPosition)) ||
    (followingWidth !== null && !nonnegative(followingWidth)) ||
    (decimalWidth !== null &&
      (!nonnegative(decimalWidth) || followingWidth === null || decimalWidth > followingWidth))
  )
    return missing('InvalidTabStopGeometry');
  let previous = -Infinity,
    selected = null;
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index];
    if (
      !stop ||
      typeof stop !== 'object' ||
      Array.isArray(stop) ||
      !finite(stop.position) ||
      stop.position < previous ||
      !['LEFT', 'RIGHT', 'CENTER', 'DECIMAL'].includes(stop.type) ||
      (stop.leader !== null && typeof stop.leader !== 'string')
    )
      return missing('InvalidTabStopGeometry');
    previous = stop.position;
    if (selected === null && stop.position > x)
      selected = {
        position: stop.position,
        type: stop.type,
        leader: stop.leader,
        source: 'declared',
        index,
      };
  }
  if (
    autoLeftPosition !== null &&
    autoLeftPosition > x &&
    (selected === null || autoLeftPosition < selected.position)
  )
    selected = {
      position: autoLeftPosition,
      type: 'LEFT',
      leader: null,
      source: 'auto-left',
      index: null,
    };
  if (selected === null && autoRight && rightEdge > x)
    selected = {
      position: rightEdge,
      type: 'RIGHT',
      leader: null,
      source: 'auto-right',
      index: null,
    };
  if (selected === null) {
    if (defaultInterval === null) return missing('MissingDefaultTabInterval');
    let ordinal = Math.floor((x - gridOrigin) / defaultInterval) + 1;
    if (!Number.isSafeInteger(ordinal)) return missing('InvalidTabStopGeometry');
    let position = gridOrigin + ordinal * defaultInterval;
    // Division may round to either side of an integral grid index. Compare
    // the constructed neighbors, without merging distinct input coordinates.
    const previousPosition = gridOrigin + (ordinal - 1) * defaultInterval;
    if (previousPosition > x) {
      ordinal--;
      position = previousPosition;
    }
    if (position <= x) {
      ordinal++;
      position = gridOrigin + ordinal * defaultInterval;
    }
    if (!Number.isSafeInteger(ordinal)) return missing('InvalidTabStopGeometry');
    if (!finite(position) || position <= x) return missing('InvalidTabStopGeometry');
    selected = { position, type: 'LEFT', leader: null, source: 'default', index: null };
  }
  if (['RIGHT', 'CENTER'].includes(selected.type) && followingWidth === null)
    return missing('MissingTabFollowingWidth');
  if (selected.type === 'DECIMAL' && decimalWidth === null)
    return missing('MissingTabDecimalWidth');
  const offset =
    selected.type === 'RIGHT'
      ? followingWidth
      : selected.type === 'CENTER'
        ? followingWidth / 2
        : selected.type === 'DECIMAL'
          ? decimalWidth
          : 0;
  const targetPosition =
    constrainRightLeader &&
    selected.source === 'declared' &&
    selected.type === 'RIGHT' &&
    selected.leader !== null &&
    selected.leader !== '' &&
    selected.leader !== 'NONE' &&
    selected.position > rightEdge
      ? rightEdge
      : selected.position;
  const start = Math.max(x, targetPosition - offset),
    advance = start - x;
  if (!finite(start) || !nonnegative(advance)) return missing('InvalidTabStopGeometry');
  return {
    state: 'placed',
    ...selected,
    start,
    advance,
    ...(targetPosition !== selected.position ? { targetPosition } : {}),
  };
}
