export function chartPreviewTicks(source, percent = false) {
  if (
    !Array.isArray(source) ||
    source.length < 2 ||
    source.length > 5 ||
    source.some(
      (tick) =>
        !tick ||
        !Number.isFinite(tick.value) ||
        !Number.isFinite(tick.fraction) ||
        tick.fraction < 0 ||
        tick.fraction > 1,
    )
  )
    return null;
  return source.map((tick) => {
    const number = percent ? tick.value * 100 : tick.value;
    const text = Number.isFinite(number)
      ? Number(number.toPrecision(4)).toString() + (percent ? '%' : '')
      : tick.value.toExponential(3) + '×100%';
    return { fraction: tick.fraction, text };
  });
}
