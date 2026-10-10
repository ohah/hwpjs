// Join independently laid-out sections without changing their source identities.
export function layoutPageSections(content, measure, maxRows, layoutSection) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidPageFlowBounds");
  const settings = new Map();
  for (const setting of content.pageSettings) {
    const section = setting.section_ordinal;
    if (!Number.isSafeInteger(section) || section < 0 || settings.has(section)) return unavailable("AmbiguousPageSettings");
    settings.set(section, setting);
  }
  if (content.paragraphs.some(row => !settings.has(row.section)) || content.paragraphFlows?.some(row => !settings.has(row.section))) return unavailable("UnsupportedPageSections");
  const rows = [], pages = [], overflow = [];
  let height = 20, limited = Boolean(content.limited);
  const moveBox = (box, offset) => box ? { ...box, y: box.y + offset } : box;
  for (const [section, setting] of [...settings].sort(([a], [b]) => a - b)) {
    if (rows.length >= maxRows) { limited = true; break; }
    const part = layoutSection({ ...content,
      limited: false,
      paragraphs: content.paragraphs.filter(row => row.section === section),
      paragraphFlows: content.paragraphFlows?.filter(row => row.section === section),
      pageSettings: [setting],
    }, measure, maxRows - rows.length);
    if (part.state !== "paginated") return part;
    if (pages.length + part.pages.length > 2000) return unavailable("PageFlowLimit");
    const offset = pages.length ? height : 0;
    const ordinal = pages.length;
    for (const page of part.pages) pages.push({ ...page, section, ordinal: ordinal + page.ordinal,
      paper: moveBox(page.paper, offset), page: moveBox(page.page, offset),
      columns: page.columns.map(box => moveBox(box, offset)),
      ...(page.header ? { header: moveBox(page.header, offset) } : {}),
      ...(page.footer ? { footer: moveBox(page.footer, offset) } : {}),
    });
    for (const row of part.rows) rows.push({ ...row, y: row.y + offset, pageOrdinal: ordinal + row.pageOrdinal,
      referenceBoxes: Object.fromEntries(Object.entries(row.referenceBoxes).map(([key, box]) => [key, moveBox(box, offset)])),
    });
    for (const item of part.pageAreaOverflow ?? []) overflow.push({ ...item, section, pageOrdinal: ordinal + item.pageOrdinal });
    if (part.pages.length) height = Math.max(height, part.height + offset);
    limited ||= part.limited;
    if (part.limited) break;
  }
  return { state: "paginated", rows, pages, height, limited, spatialRows: true, pageLayoutMode: "measured-body", ...(overflow.length ? { pageAreaOverflow: overflow } : {}) };
}
