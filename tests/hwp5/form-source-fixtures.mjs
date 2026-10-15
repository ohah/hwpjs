// Observed corpus expectations, not a format/version support table.
export const formSourceFixtures = Object.freeze([
  ["form-01.hwp", 13, 5], ["form-02.hwp", 13, 5],
  ["basic/Textmail.hwp", 22, 4], ["basic/calendar_monthly.hwp", 71, 4],
  ["basic/calendar_year.hwp", 616, 3], ["basic/request.hwp", 67, 13],
  ["hwpx/hancom-hwp/form-002.hwp", 644, 180],
].map(([name, paragraphs, forms]) => Object.freeze({ name, paragraphs, forms })));
