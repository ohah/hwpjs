/** Paint only bands contained in the already-reserved separator envelope. */
export function paintNoteSeparator(ctx, separator, scrollTop = 0) {
  if (
    !separator ||
    ![separator.x, separator.y, separator.width, separator.height, scrollTop].every(
      Number.isFinite,
    ) ||
    separator.width <= 0 ||
    separator.height <= 0 ||
    typeof separator.color !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(separator.color)
  )
    return false;
  const bands = separator.bands ?? [{ y: 0, height: separator.height }];
  if (
    !Array.isArray(bands) ||
    !bands.length ||
    bands.some(
      (band, index) =>
        !band ||
        ![band.y, band.height, band.y + band.height].every(Number.isFinite) ||
        band.y < 0 ||
        band.height <= 0 ||
        band.y + band.height > separator.height + 1e-8 ||
        (index > 0 && band.y < bands[index - 1].y + bands[index - 1].height),
    )
  )
    return false;
  ctx.fillStyle = separator.color;
  for (const band of bands)
    ctx.fillRect(separator.x, separator.y - scrollTop + band.y, separator.width, band.height);
  return true;
}
