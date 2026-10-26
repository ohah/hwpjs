import { tableAnchorCoverage } from "./table-anchor-coverage.mjs";
import { planHwp5PageControls } from "./hwp5-page-control-plan.mjs";
import { partitionPageAreaOwnership } from "./page-area-ownership.mjs";
import { layoutPageAreaInstances } from "./page-area-instance-layout.mjs";
import { layoutDeclaredPageAreas } from "./page-area-declaration-flow.mjs";
import { layoutPageNumberGlyphs } from "./page-number-glyphs.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { planHwp5SectionPageControls } from "./hwp5-section-page-control-plan.mjs";

// Paginate body first, then resolve numbering before repeating page areas.
export function layoutHwp5ControlledPages(content, measure, maxRows, layoutBody) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !content.pageSettings?.length ||
    (content.pageSettings.length !== 1 && !content.hwp5PageNumberSource?.section_starts?.length)
  )
    return fail("UnsupportedHwp5ControlledSections");
  const setting = content.pageSettings[0],
    source = content.hwp5PageNumberSource;
  const areas = (content.paragraphFlows ?? []).filter((flow) =>
    ["header", "footer"].includes(flow.host),
  );
  const partition = areas.length
    ? partitionPageAreaOwnership(content)
    : { state: "partitioned", body: content, areas: [] };
  if (partition.state !== "partitioned") return partition;
  const { hwp5PageNumberSource: _pageAreaNumberSource, ...bodyContent } = partition.body;
  const body = layoutBody(bodyContent, measure, maxRows);
  if (body.state !== "paginated") return body;
  if (body.limited) return fail("Hwp5ControlledPageLimit");
  const coverage = tableAnchorCoverage(bodyContent, body);
  if (coverage.state !== "covered") return coverage;
  const controlRows = [...body.rows, ...coverage.rows];
  // Single-section object producers may omit a redundant page owner. Bind it
  // from the unique source setting; explicit owners and multi-section scopes
  // still pass through strict numbering validation unchanged.
  const numberedPages =
    content.pageSettings.length === 1
      ? body.pages.map((page) =>
          page.section === undefined ? { ...page, section: setting.section_ordinal } : page,
        )
      : body.pages;
  const plan = source.section_starts?.length
    ? planHwp5SectionPageControls(
        source.page_controls,
        content.paragraphs,
        controlRows,
        numberedPages,
        source.section_starts,
        source.start_page,
      )
    : planHwp5PageControls(
        source.page_controls,
        content.paragraphs,
        controlRows,
        numberedPages,
        source.start_page,
      );
  if (plan.state !== "planned") return plan;
  const pages = [];
  for (const page of plan.pages) {
    const matches = content.pageSettings.filter((row) => row.section_ordinal === page.section);
    const current =
      matches.length === 1
        ? matches[0]
        : content.pageSettings.length === 1 && page.section === undefined
          ? setting
          : null;
    if (!current) return fail("UnsupportedHwp5ControlledSections");
    pages.push({
      ...page,
      section: current.section_ordinal,
      header: {
        x: page.page.x,
        y: page.paper.y + hwpUnitPixels(current.margin.top),
        width: page.page.width,
        height: hwpUnitPixels(current.margin.header),
      },
      footer: {
        x: page.page.x,
        y: page.page.y + page.page.height,
        width: page.page.width,
        height: hwpUnitPixels(current.margin.bottom),
      },
    });
  }
  const declared =
    Object.hasOwn(content, "pageAreaDeclarations") ||
    Object.hasOwn(content, "pageAreaDeclarationErrors");
  const repeated = areas.length
    ? declared
      ? layoutDeclaredPageAreas(
          content,
          partition,
          body,
          pages,
          measure,
          maxRows - body.rows.length,
        )
      : layoutPageAreaInstances(content, partition, pages, measure, maxRows - body.rows.length)
    : { state: "placed", rows: [], overflow: [] };
  if (repeated.state !== "placed") return repeated;
  const numbers = layoutPageNumberGlyphs(pages, content.paragraphs, measure);
  if (numbers.state !== "placed") return numbers;
  const rows = [...body.rows, ...repeated.rows].toSorted((a, b) => a.y - b.y);
  return {
    ...body,
    pages,
    rows,
    pageNumberGlyphs: numbers.glyphs,
    pageAreaOverflow: repeated.overflow,
    ...(repeated.boxes?.length ? { boxes: [...(body.boxes ?? []), ...repeated.boxes] } : {}),
    ...(repeated.placedDrawings?.length
      ? { placedDrawings: [...(body.placedDrawings ?? []), ...repeated.placedDrawings] }
      : {}),
    ...(repeated.flowPictures?.length
      ? { flowPictures: [...(body.flowPictures ?? []), ...repeated.flowPictures] }
      : {}),
    ...(repeated.tableAnchors?.length
      ? { tableAnchors: [...(body.tableAnchors ?? []), ...repeated.tableAnchors] }
      : {}),
    ...(areas.length && declared
      ? {
          pageAreaSelectionPolicy: repeated.policy,
          pageAreaDeclarationPages: repeated.declarationPages,
        }
      : {}),
    spatialRows: true,
    height: Math.max(body.height, ...rows.map((row) => row.y + row.height)),
  };
}
