import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { isUtf16Boundary } from "./utf16-boundary.mjs";

function sectionIndex(items, field, accept = () => true) {
  const sections = new Map();
  for (const item of items) {
    if (!accept(item)) continue;
    const section = item.section;
    let entries = sections.get(section);
    if (!entries) sections.set(section, entries = new Map());
    let group = entries.get(item[field]);
    if (!group) entries.set(item[field], group = []);
    group.push(item);
  }
  return (section, value) => sections.get(section)?.get(value) ?? [];
}

// Locate only unambiguous physical source pages; never infer activation policy
// from edit affinity or choose one side of a page-boundary declaration.
export function bindPageAreaDeclarationPages(content, layout) {
  const fail = error => ({ state: "unavailable", error });
  if (!Array.isArray(content?.pageAreaDeclarations) || !Array.isArray(content.paragraphs)
    || content.pageAreaDeclarationErrors?.length || layout?.state !== "paginated" || layout.limited
    || !Array.isArray(layout.pages) || !Array.isArray(layout.rows)
    || content.paragraphs.some(row => !row) || layout.rows.some(row => !row) || layout.pages.some(page => !page)) return fail("MissingPageAreaDeclarationLayout");
  const output = [], owners = new Set();
  // Request-local only: duplicates stay visible to the ownership checks below.
  const paragraphRows = sectionIndex(content.paragraphs, "paragraph");
  const textRows = sectionIndex(layout.rows, "paragraph", row => row.kind === "text");
  const physicalPages = sectionIndex(layout.pages, "ordinal");
  for (const declaration of content.pageAreaDeclarations) {
    if (!declaration || ![declaration.section, declaration.paragraph, declaration.sourceElement, declaration.unit]
      .every(value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff)) return fail("InvalidPageAreaDeclaration");
    const key = declaration.section + ":" + declaration.sourceElement;
    if (owners.has(key)) return fail("AmbiguousPageAreaDeclaration");
    owners.add(key);
    const matches = paragraphRows(declaration.section, declaration.paragraph);
    if (matches.length !== 1 || matches[0].clipped || !isUtf16Boundary(matches[0].text, declaration.unit)) return fail("InvalidPageAreaDeclaration");
    const rows = textRows(declaration.section, declaration.paragraph);
    if (pageParagraphCoverage(matches, rows).state !== "complete") return fail("IncompletePageAreaDeclarationCoverage");
    const candidates = rows.filter(row => row.startUnit <= declaration.unit && declaration.unit <= row.endUnit);
    const pages = new Set();
    for (const row of candidates) {
      if (!Number.isSafeInteger(row.pageOrdinal) || row.pageOrdinal < 0 || row.pageOrdinal > 0xffffffff) return fail("InvalidPageAreaDeclarationPage");
      const page = physicalPages(declaration.section, row.pageOrdinal);
      if (page.length !== 1) return fail("InvalidPageAreaDeclarationPage");
      pages.add(row.pageOrdinal);
    }
    if (pages.size !== 1) return fail("AmbiguousPageAreaDeclarationPage");
    output.push({ ...declaration, pageOrdinal: [...pages][0] });
  }
  return { state: "bound", declarations: output };
}
