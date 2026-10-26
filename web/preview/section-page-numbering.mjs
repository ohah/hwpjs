/** Baseline numbering only; callers must separately resolve source controls. */
export function numberSectionPages(pages, starts, documentStart) {
  if (
    !Array.isArray(pages) ||
    !Array.isArray(starts) ||
    !starts.length ||
    !Number.isInteger(documentStart) ||
    documentStart < 1 ||
    documentStart > 0xffff
  )
    throw new Error("InvalidSectionPageNumbering");
  for (let i = 0; i < starts.length; i++) {
    const source = starts[i];
    if (
      !source ||
      source.section !== i ||
      !Number.isInteger(source.start) ||
      source.start < 0 ||
      source.start > 0xffff
    )
      throw new Error("InvalidSectionPageNumbering");
  }
  let section = -1,
    next = documentStart;
  const result = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (
      !page ||
      page.ordinal !== i ||
      !Number.isInteger(page.section) ||
      page.section < 0 ||
      page.section >= starts.length ||
      page.section < section ||
      page.section > section + 1
    )
      throw new Error("InvalidSectionPageNumbering");
    if (page.section !== section) {
      section = page.section;
      if (starts[section].start !== 0) next = starts[section].start;
    }
    if (next > 0xffffffff) throw new Error("PageNumberOverflow");
    result.push({ ...page, number: next++ });
  }
  if (section !== starts.length - 1) throw new Error("IncompleteSectionPages");
  return result;
}
