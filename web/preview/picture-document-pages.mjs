import { paginatePictureParagraph } from "./picture-paragraph-pages.mjs";
import { paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { pageSequenceReference } from "./page-sequence-reference.mjs";

// 단일 단 본문의 문단 순서와 간격만 소유합니다. 그림 좌표 확정은 호출자 책임입니다.
export function paginatePictureDocument(paragraphs, setting, reservations, measure, flows = [], options = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  const { maxPages = 2000, maxRows = 20000, ...origin } = options;
  if (!Array.isArray(paragraphs) || !paragraphs.length || !Array.isArray(flows) || !Number.isSafeInteger(maxPages) || maxPages < 1 || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidPictureDocumentPages");
  const flowMap = new Map();
  for (const flow of flows) {
    if (!flow || flow.top_level !== true || flow.single_column !== true || flow.column_break === true || ![true, false, null].includes(flow.page_break)) return unavailable("UnsupportedPageFlow");
    const key = `${flow.section}:${flow.paragraph}`;
    if (flowMap.has(key)) return unavailable("UnsupportedPageFlow");
    flowMap.set(key, flow);
  }
  const rows = [], pages = new Map(), owners = new Set();
  let ordinal = 0, y = null, height = 0;
  for (const paragraph of paragraphs) {
    if (!paragraph) return unavailable("InvalidPictureDocumentPages");
    if (!Number.isSafeInteger(paragraph.section) || paragraph.section < 0 || !Number.isSafeInteger(paragraph.paragraph) || paragraph.paragraph < 0) return unavailable("InvalidPictureDocumentPages");
    if (paragraph.section !== paragraphs[0].section) return unavailable("UnsupportedPictureDocumentSections");
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (flows.length && !flowMap.has(key)) return unavailable("MissingPictureDocumentFlow");
    if (owners.has(key)) return unavailable("AmbiguousPictureDocumentParagraph");
    owners.add(key);
    if (rows.length && flowMap.get(key)?.page_break === true) { ordinal++; y = null; }
    if (ordinal >= maxPages || rows.length >= maxRows) return unavailable("PictureDocumentPageLimit");
    const reference = pageSequenceReference(setting, ordinal, origin);
    if (reference.state !== "placed") return unavailable(reference.state);
    const body = reference.boxes.page;
    y = (y ?? body.y) + paragraphSpacePixels(paragraph.paragraphShape?.before);
    if (y >= body.y + body.height) { ordinal++; y = null; }
    if (ordinal >= maxPages) return unavailable("PictureDocumentPageLimit");
    const result = paginatePictureParagraph(paragraph, setting, reservations, measure, { ...origin,
      startPage: ordinal, startY: y, maxPages: maxPages - ordinal, maxRows: maxRows - rows.length });
    if (result.state !== "paginated") return result;
    rows.push(...result.rows);
    for (const page of result.pages) pages.set(page.ordinal, page);
    ordinal = result.endPage;
    y = result.nextY + paragraphSpacePixels(paragraph.paragraphShape?.after);
    height = result.height;
  }
  if (flows.length && flowMap.size !== owners.size) return unavailable("AmbiguousPictureDocumentFlow");
  return { state: "paginated", rows, pages: [...pages.values()], height, limited: false, spatialRows: true, pageLayoutMode: "measured-body" };
}
