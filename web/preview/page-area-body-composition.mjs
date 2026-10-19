import { partitionPageAreaOwnership } from "./page-area-ownership.mjs";
import { layoutPageAreas } from "./page-area-flow.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Paginate body objects first; only then repeat explicitly owned page areas. */
export function composePageAreaBody(content, measure, maxRows, layoutBody, { pageNumbers, ...bodyOptions } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || typeof measure !== "function" || typeof layoutBody !== "function"
    || !Array.isArray(content?.pageSettings) || content.pageSettings.length !== 1) return fail("InvalidPageAreaComposition");
  const partition = partitionPageAreaOwnership(content);
  if (partition.state !== "partitioned") return partition;
  if (!partition.areas.length) return fail("MissingPageAreaOwner");
  const body = layoutBody(partition.body, measure, maxRows, bodyOptions);
  if (body.state !== "paginated") return body;
  if (body.limited || body.rows?.length === maxRows) return fail("PageAreaOverflow");
  if (!Array.isArray(body.pages) || !body.pages.length || !Array.isArray(body.rows) || body.rows.length > maxRows
    || !Number.isFinite(body.height)) return fail("InvalidPageAreaComposition");
  const flows = content.paragraphFlows.filter(flow => ["header", "footer"].includes(flow.host));
  const numbering = flows[0].page_number_source;
  if (pageNumbers === undefined && numbering?.supported === true && Number.isInteger(numbering.start_page) && numbering.start_page > 0
    && flows.every(flow => JSON.stringify(flow.page_number_source) === JSON.stringify(numbering)))
    pageNumbers = body.pages.map(page => numbering.start_page + page.ordinal);
  if (!Array.isArray(pageNumbers) || pageNumbers.length !== body.pages.length
    || pageNumbers.some(number => !Number.isInteger(number) || number < 1 || number > 0xffffffff)) return fail("MissingEffectivePageNumber");
  const setting = content.pageSettings[0];
  if (body.pages.some((page, index) => !page || page.ordinal !== index || (page.section !== undefined && page.section !== setting.section_ordinal))) return fail("AmbiguousPageAreaInstance");
  // Unknown object projection is never replaced by a text-only success.
  if (partition.areas.some(area => ["tables", "drawings", "pictures", "lines", "containers"].some(property => area[property].length)))
    return fail("UnsupportedPageAreaObjects");
  const pages = body.pages.map((page, index) => ({ ...page, section: setting.section_ordinal, number: pageNumbers[index],
    hideFirstHeader: index === 0 && numbering?.hide_first_header === true,
    hideFirstFooter: index === 0 && numbering?.hide_first_footer === true,
    header: { x: page.page.x, y: page.paper.y + hwpUnitPixels(setting.margin.top), width: page.page.width, height: hwpUnitPixels(setting.margin.header) },
    footer: { x: page.page.x, y: page.page.y + page.page.height, width: page.page.width, height: hwpUnitPixels(setting.margin.bottom) } }));
  const repeated = layoutPageAreas({ ...content, paragraphs: partition.areas.flatMap(area => area.paragraphs),
    paragraphFlows: partition.areas.flatMap(area => area.paragraphFlows) }, pages, measure, maxRows - body.rows.length);
  if (repeated.state !== "placed") return repeated;
  return { ...body, rows: [...body.rows, ...repeated.rows].toSorted((a, b) => a.y - b.y), pages,
    spatialRows: true, pageAreaOverflow: repeated.overflow, height: Math.max(body.height, ...repeated.rows.map(row => row.y + row.height)) };
}
