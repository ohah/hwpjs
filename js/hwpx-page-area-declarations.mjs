// Current coordinates and immutable source identities, not an activation policy.
export function decodePageAreaDeclarations(bytes) {
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const invalid = () => {
    throw Error('InvalidPageAreaDeclarations');
  };
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows) || rows.length > 100000) invalid();
  const owners = new Set();
  let previousParagraph = 0;
  return rows.map((row) => {
    if (
      !row ||
      ![row.paragraph, row.source_element, row.source_control, row.unit].every(uint) ||
      row.paragraph < 1 ||
      row.paragraph < previousParagraph ||
      row.source_control >= row.source_element ||
      !['left', 'right'].includes(row.affinity) ||
      owners.has(row.source_element)
    )
      invalid();
    owners.add(row.source_element);
    previousParagraph = row.paragraph;
    return {
      paragraph: row.paragraph,
      sourceElement: row.source_element,
      sourceControl: row.source_control,
      unit: row.unit,
      affinity: row.affinity,
    };
  });
}
