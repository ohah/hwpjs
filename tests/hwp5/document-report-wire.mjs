// Independent test-side expectation, not generated from the Zig serializer.
// Updating a native report must still update/verify the expected field groups here.
const groups = Object.freeze({
  records: 1,
  paragraphs: 6,
  definition: 6,
  control_types: 3,
  lists: 3,
  tables: 4,
  parameters: 13,
  object_properties: 1,
  header_footer: 5,
  number_controls: 4,
  page_number: 4,
  index_marks: 4,
  page_visibility: 5,
  bookmarks: 8,
  char_overlap: 6,
  observed_field_links: 1,
  fields: 6,
  ruby: 6,
  hidden_comments: 6,
  notes: 7,
  equations: 8,
  ole: 7,
  shapes: 8,
  drawing_styles: 7,
  lines: 4,
  rectangles: 3,
  ellipses: 5,
  arcs: 5,
});
export const documentPrefixBytes = 33 * 4;
export const sectionReportBytes = Object.values(groups).reduce(
  (n, count) => n + count * 4,
  0,
);
const offsets = new Map();
let offset = 0;
for (const [name, count] of Object.entries(groups)) {
  offsets.set(name, offset);
  offset += count * 4;
}
function index(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65535)
    throw new RangeError("Invalid section index");
}
export function reportBytes(sectionCount) {
  index(sectionCount);
  return documentPrefixBytes + sectionCount * sectionReportBytes;
}
export function sectionFieldOffset(sectionIndex, group, field = 0) {
  index(sectionIndex);
  if (
    !offsets.has(group) ||
    !Number.isInteger(field) ||
    field < 0 ||
    field >= groups[group]
  )
    throw new RangeError("Invalid report field");
  return (
    documentPrefixBytes +
    sectionIndex * sectionReportBytes +
    offsets.get(group) +
    field * 4
  );
}
