import { tableHostProfile } from './table-host-profile.mjs';

// Structural declarations retain their source units but do not turn a table-only
// paragraph into a mixed text line. Unknown anchors and real text never qualify.
export function isSingleInlineTableHost(paragraph, table) {
  return (
    table?.sourceGeometry?.geometry?.treat_as_character === true &&
    tableHostProfile(paragraph, table)?.tableOnly === true
  );
}
