/** Explicit document formats use declared sizes; unknown prototypes keep UI defaults. */
export const usesDocumentFontMetrics = (format) => format === "hwp5" || format === "hwpx";
