import { drawingPageReference } from "./drawing-page-reference.mjs";
import { placeFloatingOleSource } from "./ole-placement.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";

/** Current anchor -> explicit physical reference. No OLE painting or flow reservation. */
export function projectFloatingOlePage(ole, paragraphs, layout, placementOptions) {
  const fail = error => ({ state: "unavailable", error });
  const id = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
  if (ole?.state !== "located" || ole.error || ole.sourceError || !id(ole.section) || !id(ole.oleNode)
    || !id(ole.paragraph) || !id(ole.anchorUnit) || layout?.state !== "paginated" || layout.limited === true
    || !Array.isArray(paragraphs) || !Array.isArray(layout.rows) || !Array.isArray(layout.pages)) return fail("InvalidOlePageAnchor");
  if ([paragraphs, layout.rows, layout.pages].some(items => items.some(item => !item || typeof item !== "object"))) return fail("InvalidOlePageAnchor");
  const owners = paragraphs.filter(p => p.section === ole.section && p.paragraph === ole.paragraph);
  const members = layout.rows.filter(row => row.kind === "text" && row.section === ole.section && row.paragraph === ole.paragraph);
  if (owners.length !== 1 || owners[0].clipped === true || pageParagraphCoverage(owners, members).state !== "complete") return fail("IncompleteOlePageAnchor");
  // Adapter to the common source-anchor contract, not a synthetic drawing in
  // the document model. Both use current U+FFFC / UTF-16 paragraph coordinates.
  const anchor = { section: ole.section, hostParagraph: ole.paragraph, anchorUnit: ole.anchorUnit, source: ole.source };
  const reference = drawingPageReference(anchor, paragraphs, layout.rows);
  if (reference.state !== "selected") return { ...fail("InvalidOlePageReference"), referenceError: reference.error };
  const ordinal = reference.host.pageOrdinal;
  if (!id(ordinal) || layout.pages.filter(page => page.section === ole.section && page.ordinal === ordinal).length !== 1) return fail("MissingOlePhysicalPage");
  const placement = placeFloatingOleSource(ole.source, reference.boxes, placementOptions);
  if (placement.state !== "placed") return placement;
  return { ...placement, section: ole.section, oleNode: ole.oleNode, pageOrdinal: ordinal,
    referenceBoxes: reference.boxes, paintable: false };
}
