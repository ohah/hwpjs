const MAX_EDGE = 8192;
const MAX_PAGE_PIXELS = 8_000_000;
const MAX_JOB_PIXELS = 80_000_000;
const MAX_PAGES = 200;

export function planPrintRaster(layout, scale = 1, singleSection) {
  if (layout.pageNumberSourceUnavailable) throw Error('HwpxPageNumberDisplaySourceAbiUnavailable');
  if (layout.pageNumberError) throw Error(`IncompletePrintPageNumbers:${layout.pageNumberError}`);
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 1 || scale > 3)
    throw Error('InvalidPrintScale');
  if (
    layout.state !== 'paginated' ||
    layout.limited ||
    layout.pageLayoutError ||
    layout.sourceCoverage === 'incomplete' ||
    layout.documentPageNumbersExact === false ||
    layout.previewReadOnlyTables?.length ||
    layout.pageAreaOverflow?.length ||
    layout.unverifiedTableSources?.length ||
    layout.unverifiedDrawingSources?.length ||
    layout.unverifiedSectionSources?.length ||
    !layout.pages?.length
  )
    throw Error(
      `IncompletePrintLayout:${layout.pageLayoutError ?? layout.pageLayoutMode ?? 'Unknown'}`,
    );
  if (layout.pages.length > MAX_PAGES) throw Error('PrintPageCountBudgetExceeded');
  let bottom = 0;
  let totalPixels = 0;
  let maxPagePixels = 0;
  const pages = layout.pages.map(
    ({ paper, section = singleSection, ordinal: sourceOrdinal }, ordinal) => {
      const { x, y, width, height } = paper ?? {};
      if (
        ![x, y, width, height, x + width, y + height].every(Number.isFinite) ||
        (sourceOrdinal !== undefined && sourceOrdinal !== ordinal) ||
        !Number.isSafeInteger(section) ||
        section < 0 ||
        x < 0 ||
        y + 1e-8 < bottom ||
        width <= 0 ||
        height <= 0
      )
        throw Error('InvalidPrintPageOrderOrGeometry');
      bottom = y + height;
      const pixelWidth = Math.ceil(width * scale);
      const pixelHeight = Math.ceil(height * scale);
      const pixels = pixelWidth * pixelHeight;
      totalPixels += pixels;
      maxPagePixels = Math.max(maxPagePixels, pixels);
      if (
        pixelWidth > MAX_EDGE ||
        pixelHeight > MAX_EDGE ||
        pixels > MAX_PAGE_PIXELS ||
        totalPixels > MAX_JOB_PIXELS
      )
        throw Error('PrintRasterBudgetExceeded');
      return { ordinal, section, x, y, width, height, pixelWidth, pixelHeight };
    },
  );
  return { pages, totalPixels, maxPagePixels };
}
