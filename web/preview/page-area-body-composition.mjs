import { partitionPageAreaOwnership } from "./page-area-ownership.mjs";
import { layoutPageAreaInstances } from "./page-area-instance-layout.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { layoutDeclaredPageAreas } from "./page-area-declaration-flow.mjs";

/** Paginate body objects first; only then repeat explicitly owned page areas. */
export function composePageAreaBody(
  content,
  measure,
  maxRows,
  layoutBody,
  { pageNumbers, ...bodyOptions } = {},
) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    typeof measure !== "function" ||
    typeof layoutBody !== "function" ||
    !Array.isArray(content?.pageSettings) ||
    content.pageSettings.length !== 1
  )
    return fail("InvalidPageAreaComposition");
  const partition = partitionPageAreaOwnership(content);
  if (partition.state !== "partitioned") return partition;
  if (!partition.areas.length) return fail("MissingPageAreaOwner");
  const body = layoutBody(partition.body, measure, maxRows, bodyOptions);
  if (body.state !== "paginated") return body;
  if (body.limited || body.rows?.length === maxRows) return fail("PageAreaOverflow");
  if (
    !Array.isArray(body.pages) ||
    !body.pages.length ||
    !Array.isArray(body.rows) ||
    body.rows.length > maxRows ||
    !Number.isFinite(body.height)
  )
    return fail("InvalidPageAreaComposition");
  const flows = content.paragraphFlows.filter((flow) => ["header", "footer"].includes(flow.host));
  const numbering = flows[0].page_number_source;
  if (
    pageNumbers === undefined &&
    numbering?.supported === true &&
    Number.isInteger(numbering.start_page) &&
    numbering.start_page > 0 &&
    flows.every((flow) => JSON.stringify(flow.page_number_source) === JSON.stringify(numbering))
  )
    pageNumbers = body.pages.map((page) => numbering.start_page + page.ordinal);
  if (
    !Array.isArray(pageNumbers) ||
    pageNumbers.length !== body.pages.length ||
    pageNumbers.some((number) => !Number.isInteger(number) || number < 1 || number > 0xffffffff)
  )
    return fail("MissingEffectivePageNumber");
  const setting = content.pageSettings[0];
  if (
    body.pages.some(
      (page) => page?.section !== undefined && page.section !== setting.section_ordinal,
    )
  )
    return fail("UnsupportedPageAreaSections");
  if (body.pages.some((page, index) => !page || page.ordinal !== index))
    return fail("AmbiguousPageAreaInstance");
  const pages = body.pages.map((page, index) => ({
    ...page,
    section: setting.section_ordinal,
    number: pageNumbers[index],
    hideFirstHeader: index === 0 && numbering?.hide_first_header === true,
    hideFirstFooter: index === 0 && numbering?.hide_first_footer === true,
    header: {
      x: page.page.x,
      y: page.paper.y + hwpUnitPixels(setting.margin.top),
      width: page.page.width,
      height: hwpUnitPixels(setting.margin.header),
    },
    footer: {
      x: page.page.x,
      y: page.page.y + page.page.height,
      width: page.page.width,
      height: hwpUnitPixels(setting.margin.bottom),
    },
  }));
  const declared =
    Object.hasOwn(content, "pageAreaDeclarations") ||
    Object.hasOwn(content, "pageAreaDeclarationErrors");
  const repeated = declared
    ? layoutDeclaredPageAreas(content, partition, body, pages, measure, maxRows - body.rows.length)
    : layoutPageAreaInstances(content, partition, pages, measure, maxRows - body.rows.length);
  if (repeated.state !== "placed") return repeated;
  return {
    ...body,
    rows: [...body.rows, ...repeated.rows].toSorted((a, b) => a.y - b.y),
    pages,
    ...(repeated.boxes.length ? { boxes: [...(body.boxes ?? []), ...repeated.boxes] } : {}),
    ...(repeated.placedDrawings.length
      ? { placedDrawings: [...(body.placedDrawings ?? []), ...repeated.placedDrawings] }
      : {}),
    ...(repeated.flowPictures.length
      ? { flowPictures: [...(body.flowPictures ?? []), ...repeated.flowPictures] }
      : {}),
    ...(repeated.tableAnchors.length
      ? { tableAnchors: [...(body.tableAnchors ?? []), ...repeated.tableAnchors] }
      : {}),
    ...(declared
      ? {
          pageAreaSelectionPolicy: repeated.policy,
          pageAreaDeclarationPages: repeated.declarationPages,
        }
      : {}),
    spatialRows: true,
    pageAreaOverflow: repeated.overflow,
    height: Math.max(body.height, ...repeated.rows.map((row) => row.y + row.height)),
  };
}
