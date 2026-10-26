// Preview coordinate policy, not persisted OOXML values or exact Hangul ticks.
const fail = (reason) => ({ state: 'unavailable', reason });
function bound(field) {
  if (field === null || field === undefined) return { value: null };
  if (field.value === null) return { error: 'MissingAxisScaleValue' };
  if (field.value?.kind !== 'finite' || !Number.isFinite(field.value.value))
    return { error: 'NonFiniteAxisScaleValue' };
  return { value: field.value.value };
}
function logDistance(low, value) {
  const relative = (value - low) / low;
  return Math.abs(relative) < 0.5 ? Math.log1p(relative) : Math.log(value) - Math.log(low);
}
export function createChartValueScale(values, scaling = null, { includeZero = true } = {}) {
  if (!Array.isArray(values) || typeof includeZero !== 'boolean')
    return fail('InvalidAxisScaleInput');
  if (
    values.some((value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
  )
    return fail('NonFiniteChartData');
  const fields = [bound(scaling?.minimum), bound(scaling?.maximum), bound(scaling?.log_base)];
  for (const field of fields) if (field.error) return fail(field.error);
  if (scaling?.orientation && !['minMax', 'maxMin'].includes(scaling.orientation.value))
    return fail('InvalidAxisOrientation');
  const [low, high, logarithm] = fields.map((field) => field.value);
  if (logarithm !== null && (logarithm < 2 || logarithm > 1000)) return fail('InvalidAxisLogBase');
  let dataMin = Infinity,
    dataMax = -Infinity;
  for (const value of values)
    if (value !== null) {
      dataMin = Math.min(dataMin, value);
      dataMax = Math.max(dataMax, value);
    }
  if (dataMin === Infinity && (low === null || high === null)) return fail('EmptyAxisScaleData');
  if (
    logarithm !== null &&
    (dataMin <= 0 || (low !== null && low <= 0) || (high !== null && high <= 0))
  )
    return fail('NonPositiveLogScale');
  let minimum = low ?? (includeZero && logarithm === null ? Math.min(0, dataMin) : dataMin);
  let maximum = high ?? (includeZero && logarithm === null ? Math.max(0, dataMax) : dataMax);
  if (minimum === maximum && low === null && high === null) {
    if (logarithm === null) {
      if (minimum === 0) maximum = 1;
      else if (!includeZero) {
        minimum = minimum > 0 ? 0 : minimum;
        maximum = maximum < 0 ? 0 : maximum;
      }
    } else {
      const smaller = minimum / logarithm,
        larger = maximum * logarithm;
      if (smaller > 0 && smaller < minimum) minimum = smaller;
      else if (Number.isFinite(larger) && larger > maximum) maximum = larger;
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum)
    return fail('InvalidAxisScaleRange');
  const reversed = scaling?.orientation?.value === 'maxMin';
  const magnitude = Math.max(Math.abs(minimum), Math.abs(maximum));
  const span =
    logarithm === null ? maximum / magnitude - minimum / magnitude : logDistance(minimum, maximum);
  if (!Number.isFinite(span) || span <= 0) return fail('AxisScalePrecisionLoss');
  const project = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || (logarithm !== null && value <= 0))
      return null;
    const position =
      logarithm === null
        ? (value / magnitude - minimum / magnitude) / span
        : logDistance(minimum, value) / span;
    if (!Number.isFinite(position)) return null;
    return reversed ? 1 - position : position;
  };
  return {
    state: 'ready',
    minimum,
    maximum,
    logarithm,
    reversed,
    project,
    ticks() {
      const result = [];
      for (let i = 0; i < 5; i++) {
        const fraction = i / 4;
        const value =
          i === 0
            ? minimum
            : i === 4
              ? maximum
              : logarithm === null
                ? minimum * (1 - fraction) + maximum * fraction
                : Math.max(
                    minimum,
                    Math.min(
                      maximum,
                      span < 1
                        ? minimum * Math.exp(span * fraction)
                        : Math.exp(
                            Math.log(minimum) * (1 - fraction) + Math.log(maximum) * fraction,
                          ),
                    ),
                  );
        const position = project(value);
        if (!Number.isFinite(value) || !Number.isFinite(position)) return null;
        if (!result.some((tick) => tick.value === value))
          result.push({ value, fraction: Math.max(0, Math.min(1, position)) });
      }
      return result;
    },
  };
}
