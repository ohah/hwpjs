import { planHwp5PageControls } from "./hwp5-page-control-plan.mjs";
import { layoutPageAreas } from "./page-area-flow.mjs";
import { layoutPageNumberGlyphs } from "./page-number-glyphs.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// Paginate body first, then resolve numbering before repeating page areas.
export function layoutHwp5ControlledPages(content, measure, maxRows, layoutBody) {
  const fail = error => ({ state: "unavailable", error });
  if (content.pageSettings?.length !== 1) return fail("UnsupportedHwp5ControlledSections");
  const setting = content.pageSettings[0], source = content.hwp5PageNumberSource;
  const areas = (content.paragraphFlows ?? []).filter(flow => ["header", "footer"].includes(flow.host));
  const areaIds = new Set(areas.map(flow => `${flow.section}:${flow.paragraph}`));
  const { hwp5PageNumberSource, ...bodyContent } = content;
  const body = layoutBody({ ...bodyContent, paragraphs: content.paragraphs.filter(p => !areaIds.has(`${p.section}:${p.paragraph}`)),
    paragraphFlows: content.paragraphFlows.filter(flow => !areaIds.has(`${flow.section}:${flow.paragraph}`)) }, measure, maxRows);
  if (body.state !== "paginated") return body;
  if (body.limited) return fail("Hwp5ControlledPageLimit");
  const plan = planHwp5PageControls(source.page_controls, content.paragraphs, body.rows, body.pages, source.start_page);
  if (plan.state !== "planned") return plan;
  const pages = plan.pages.map(page => ({ ...page,
    header: { x: page.page.x, y: page.paper.y + hwpUnitPixels(setting.margin.top), width: page.page.width, height: hwpUnitPixels(setting.margin.header) },
    footer: { x: page.page.x, y: page.page.y + page.page.height, width: page.page.width, height: hwpUnitPixels(setting.margin.bottom) } }));
  const repeated = areas.length ? layoutPageAreas(content, pages, measure, maxRows - body.rows.length) : { state: "placed", rows: [], overflow: [] };
  if (repeated.state !== "placed") return repeated;
  const numbers = layoutPageNumberGlyphs(pages, content.paragraphs, measure);
  if (numbers.state !== "placed") return numbers;
  const rows = [...body.rows, ...repeated.rows].toSorted((a, b) => a.y - b.y);
  return { ...body, pages, rows, pageNumberGlyphs: numbers.glyphs, pageAreaOverflow: repeated.overflow,
    spatialRows: true, height: Math.max(body.height, ...rows.map(row => row.y + row.height)) };
}
