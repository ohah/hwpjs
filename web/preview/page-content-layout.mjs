import { layoutContent } from "./layout.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { layoutPageAreas } from "./page-area-flow.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { measureColumnContent } from "./column-content-layout.mjs";
import { layoutPageSections } from "./page-section-layout.mjs";
import { layoutTableBodyContent } from "./table-body-content-layout.mjs";
import { layoutDrawingBodyContent } from "./drawing-body-content-layout.mjs";
import { layoutPictureBodyContent } from "./picture-body-content-layout.mjs";
import { layoutMixedInlineBody } from "./mixed-inline-body-layout.mjs";
import { layoutNoteBodyPages } from "./note-body-page-layout.mjs";
import { layoutHwp5ControlledPages } from "./hwp5-controlled-page-layout.mjs";
import { layoutCreatedTableInlinePages } from "./created-table-inline-page-layout.mjs";

/** Physical-page flow for the currently supported single-section body path. */
export function layoutPageContent(content, measure, maxRows = 20000, { pageNumbers } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (content.pageSettingsError || content.paragraphFlowErrors?.length || !content.pageSettings?.length) return unavailable("AmbiguousPageSettings");
  if (content.createdTables?.length) {
    if (pageNumbers !== undefined) return unavailable("UnsupportedCreatedTablePageNumbers");
    return content.paragraphFlows?.some(flow => ["footnote", "endnote"].includes(flow.host))
      ? layoutNoteBodyPages(content, measure, maxRows) : layoutCreatedTableInlinePages(content, measure, maxRows);
  }
  if (content.hwp5PageNumberSource?.page_controls?.length) {
    if (pageNumbers !== undefined) return unavailable("UnsupportedHwp5ControlledPageOverride");
    return layoutHwp5ControlledPages(content, measure, maxRows, layoutPageContent);
  }
  if (content.paragraphFlows?.some(flow => ["footnote", "endnote"].includes(flow.host))) return layoutNoteBodyPages(content, measure, maxRows);
  if (content.drawings?.length && content.tables?.length) return content.drawings.every(d => d.source?.geometry?.treat_as_character === false)
    ? layoutDrawingBodyContent(content, measure, maxRows, layoutPageContent)
    : layoutMixedInlineBody(content, measure, maxRows);
  if (content.drawings?.length && !content.tables?.length) return layoutDrawingBodyContent(content, measure, maxRows, layoutPageContent);
  if (content.tables?.length) return layoutTableBodyContent(content, measure, maxRows);
  if (content.pictures?.length) return layoutPictureBodyContent(content, measure, maxRows);
  if (content.tables?.length || content.pictures?.length || content.paragraphs.some(p => p.tableCell || p.clipped)) return unavailable("UnsupportedPageObjects");
  if (content.pageSettings.length > 1) {
    if (pageNumbers !== undefined) return unavailable("UnsupportedSectionPageNumbers");
    return layoutPageSections(content, measure, maxRows, layoutPageContent);
  }
  const setting = content.pageSettings[0];
  if (!Number.isSafeInteger(setting.section_ordinal) || setting.section_ordinal < 0) return unavailable("AmbiguousPageSettings");
  if (content.paragraphs.some(p => p.section !== setting.section_ordinal)) return unavailable("UnsupportedPageSections");
  const reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  const areas = content.paragraphFlows?.filter(flow => ["header", "footer"].includes(flow.host)) ?? [];
  const areaIds = new Set(areas.map(flow => flow.paragraph));
  const body = areas.length ? { ...content, paragraphs: content.paragraphs.filter(paragraph => !areaIds.has(paragraph.paragraph)) } : content;
  const bodyFlows = (content.paragraphFlows ?? []).filter(flow => !areaIds.has(flow.paragraph));
  const columnZones = !bodyFlows.every(flow => flow.single_column === true);
  const measured = columnZones ? measureColumnContent(body, reference.boxes.page, bodyFlows, measure, maxRows) : layoutContent(body, reference.boxes.page.width, measure, maxRows, { documentBody: true });
  if (measured.state === "unavailable") return measured;
  const paginated = paginateBodyRows(measured.rows, setting, bodyFlows, { columnZones, zoneGap: setting.column_zone_gap ?? 0, measureRow: measured.measureRow, maxRows });
  if (paginated.state !== "paginated") return paginated;
  if (areas.length) {
    const numbering = areas[0].page_number_source;
    if (pageNumbers === undefined && numbering?.supported === true && Number.isInteger(numbering.start_page) && numbering.start_page > 0 && areas.every(area => JSON.stringify(area.page_number_source) === JSON.stringify(numbering))) {
      pageNumbers = paginated.pages.map(page => numbering.start_page + page.ordinal);
    }
    if (!Array.isArray(pageNumbers) || pageNumbers.length !== paginated.pages.length) return unavailable("MissingEffectivePageNumber");
    if (pageNumbers.some(number => !Number.isInteger(number) || number < 1 || number > 0xffffffff)) return unavailable("MissingEffectivePageNumber");
    const pages = paginated.pages.map((page, index) => ({ ...page, number: pageNumbers[index],
      hideFirstHeader: index === 0 && numbering?.hide_first_header === true,
      hideFirstFooter: index === 0 && numbering?.hide_first_footer === true,
      header: { x: page.page.x, y: page.paper.y + hwpUnitPixels(setting.margin.top), width: page.page.width, height: hwpUnitPixels(setting.margin.header) },
      footer: { x: page.page.x, y: page.page.y + page.page.height, width: page.page.width, height: hwpUnitPixels(setting.margin.bottom) },
    }));
    const repeated = layoutPageAreas(content, pages, measure, maxRows - paginated.rows.length);
    if (repeated.state !== "placed") return repeated;
    paginated.rows = [...paginated.rows, ...repeated.rows].toSorted((a, b) => a.y - b.y);
    paginated.pages = pages;
    paginated.spatialRows = true;
    paginated.pageAreaOverflow = repeated.overflow;
    paginated.height = Math.max(paginated.height, ...repeated.rows.map(row => row.y + row.height));
  }
  return { ...paginated, pages: paginated.pages.map(page => ({ ...page, section: setting.section_ordinal })), limited: measured.limited || paginated.limited, pageLayoutMode: "measured-body" };
}
