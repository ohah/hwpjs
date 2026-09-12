import {documentRecords} from './documents.mjs';

// Inventory framing before optional semantic validation. Neither stage catches
// failures: the caller owns exclusion reporting, and traps remain failures.
export function inspectDrawingSection(call, header, section, name, videoRecords) {
  const bytes = call(3, Buffer.concat([header, section.raw]));
  const records = documentRecords(bytes);
  for (const record of records) {
    // Specification table 57: HWPTAG_BEGIN (0x10) + 82.
    if (record.tag === 98) videoRecords.push({name,section:section.name,offset:record.offset,bytes:record.end-record.start});
  }
  call(51, Buffer.concat([header.subarray(32, 36), bytes]));
  return {bytes, records};
}
