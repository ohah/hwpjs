import { layoutContent } from "./layout.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { composePageAreaBody } from "./page-area-body-composition.mjs";
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
export function layoutPageContent(content, measure, maxRows = 20000, { pageNumbers, rowY, minimumRowPage } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (content.pageSettingsError || content.paragraphFlowErrors?.length || !content.pageSettings?.length) return unavailable("AmbiguousPageSettings");
  if (content.pictureCaptionErrors?.length) return unavailable("AmbiguousPictureCaptionContent");
  if (content.pictures?.some(p => p.captionPartial)) return unavailable("IncompletePictureCaptionContent");
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
  if (content.pageSettings.length > 1) {
    if (pageNumbers !== undefined) return unavailable("UnsupportedSectionPageNumbers");
    return layoutPageSections(content, measure, maxRows, layoutPageContent);
  }
  if (content.pageSettings.length === 1 && content.paragraphFlows?.some(flow => ["header", "footer"].includes(flow.host)))
    return composePageAreaBody(content, measure, maxRows, layoutPageContent, { pageNumbers, rowY, minimumRowPage });
  if (content.drawings?.length && content.tables?.length) return content.drawings.every(d => d.source?.geometry?.treat_as_character === false)
    ? layoutDrawingBodyContent(content, measure, maxRows, layoutPageContent)
    : layoutMixedInlineBody(content, measure, maxRows);
  if (content.drawings?.length && !content.tables?.length) return layoutDrawingBodyContent(content, measure, maxRows, layoutPageContent);
  if (content.tables?.length) return layoutTableBodyContent(content, measure, maxRows, { rowY, minimumRowPage });
  if (content.pictures?.length) return layoutPictureBodyContent(content, measure, maxRows);
  if (content.tables?.length || content.pictures?.length || content.paragraphs.some(p => p.tableCell || p.clipped)) return unavailable("UnsupportedPageObjects");
  const setting = content.pageSettings[0];
  if (!Number.isSafeInteger(setting.section_ordinal) || setting.section_ordinal < 0) return unavailable("AmbiguousPageSettings");
  if (content.paragraphs.some(p => p.section !== setting.section_ordinal)) return unavailable("UnsupportedPageSections");
  const reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  const body = content;
  const bodyFlows = content.paragraphFlows ?? [];
  const columnZones = !bodyFlows.every(flow => flow.single_column === true);
  const measured = columnZones ? measureColumnContent(body, reference.boxes.page, bodyFlows, measure, maxRows) : layoutContent(body, reference.boxes.page.width, measure, maxRows, { documentBody: true });
  if (measured.state === "unavailable") return measured;
  const paginated = paginateBodyRows(measured.rows, setting, bodyFlows, { columnZones, zoneGap: setting.column_zone_gap ?? 0, measureRow: measured.measureRow, maxRows, rowY, minimumRowPage });
  if (paginated.state !== "paginated") return paginated;
  return { ...paginated, pages: paginated.pages.map(page => ({ ...page, section: setting.section_ordinal })), limited: measured.limited || paginated.limited, pageLayoutMode: "measured-body" };
}
