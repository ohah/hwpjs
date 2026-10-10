import { hwp5PageGeometry } from "./hwp5-page-geometry.mjs";
import { projectHwp5ColumnFlow } from "./hwp5-column-flow.mjs";
import { layoutPageContent } from "./page-content-layout.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { hwp5EffectivePageNumberSource } from "./hwp5-document-numbering.mjs";
import { projectHwp5RootContent } from "./hwp5-root-content-projection.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { hwp5SectionExtensionSupported } from "./hwp5-section-extension-policy.mjs";
import { previewLineLayers } from "./line-layers.mjs";
import { projectHwp5MasterPages } from "./hwp5-master-page-projection.mjs";
import { layoutMasterPageRows } from "./master-page-flow.mjs";
/** Measured preview under observed default section settings; not Hancom pagination. */
export function layoutHwp5PageContent(content, measure, maxRows = 20000, options = {}) {
  try {
    if (content.pageControlSources?.length && options.pageNumbers !== undefined) return { state: "unavailable", error: "UnsupportedHwp5ControlledPageOverride" };
    const masterProjection = projectHwp5MasterPages(content);
    content = masterProjection.content;
    let unrenderedObjects = [];
    const roots = projectHwp5RootContent(content);
    if (roots.state === "unavailable") return roots;
    if (roots.state === "projected") content = roots.content;
    else {
      // Retain the existing body/table preview, but never claim the omitted objects.
      unrenderedObjects = content.hwp5Drawings.filter(row => !(content.pictures ?? []).some(picture => picture.section === row.section && picture.pictureNode === row.componentNode && picturePaintPlan(picture).state !== "unsupported_transform"))
        .map(row => ({ section: row.section, componentNode: row.componentNode, kindId: row.source.kind_id }));
    }
    if (content.pageSourceErrors?.length || content.sectionSourceErrors?.length || !content.pageSources?.length || !content.sectionSources?.length) throw new Error("MissingHwp5PageSources");
    const sections = new Map();
    for (const source of content.sectionSources) {
      if (sections.has(source.section)) throw new Error("AmbiguousHwp5SectionSources");
      const masterGroup = masterProjection.groups.find(group => group.section === source.section);
      if ((!masterGroup && source.flags !== 0) || source.vertical_grid !== 0 || source.horizontal_grid !== 0) throw new Error("UnsupportedHwp5SectionLayout");
      // Explicit observed zero-tail profile, not universal extension trimming.
      if (!hwp5SectionExtensionSupported(source)) throw new Error("UnsupportedHwp5SectionExtension");
      if (!Number.isInteger(source.column_gap) || source.column_gap < 0) throw new Error("UnsupportedHwp5SectionGap");
      sections.set(source.section, source);
    }
    const seen = new Set();
    const pageSettings = content.pageSources.map(source => {
      if (seen.has(source.section) || !sections.has(source.section)) throw new Error("AmbiguousHwp5PageSources");
      seen.add(source.section);
      return { ...hwp5PageGeometry(source), column_zone_gap: hwpUnitPixels(sections.get(source.section).column_gap) };
    });
    if (seen.size !== sections.size) throw new Error("MissingHwp5PageSources");
    const paragraphFlows = projectHwp5ColumnFlow(content, { tableCells: Boolean(content.tables?.length), pageAreas: true, notes: true, captions: true, drawings: Boolean(content.drawings?.length) });
    if (options.pageNumbers === undefined && (paragraphFlows.some(row => ["header", "footer"].includes(row.host)) || content.pageControlSources?.length)) {
      const numbering = hwp5EffectivePageNumberSource(content);
      if (numbering.page_controls?.length) content = { ...content, hwp5PageNumberSource: numbering };
      for (const row of paragraphFlows) if (["header", "footer"].includes(row.host)) row.page_number_source = numbering;
    }
    if (paragraphFlows.some(row => !seen.has(row.section))) throw new Error("MissingHwp5PageSources");
    const layout = layoutPageContent({ ...content, pageSettings, paragraphFlows }, measure, maxRows, options);
    if (layout.state === "paginated" && masterProjection.groups.length) {
      for (const group of masterProjection.groups) {
        const sectionPages = layout.pages.filter(page => page.section === group.section || page.section === undefined && pageSettings.length === 1 && pageSettings[0].section_ordinal === group.section);
        if (!sectionPages.length) throw new Error("MissingHwp5MasterPagePages");
        const pages = sectionPages.filter(page => !page.hideMasterPage);
        if (!pages.length) continue;
        const repeated = layoutMasterPageRows(group.paragraphs, group.profile, pages, measure, maxRows - layout.rows.length);
        if (repeated.state !== "placed") return repeated;
        layout.rows = [...layout.rows, ...repeated.rows].toSorted((a, b) => a.y - b.y);
        layout.spatialRows = true;
      }
    }
    if (layout.state === "paginated" && content.lines?.length) {
      const layers = previewLineLayers(content, layout, layout.width ?? 1);
      const painted = [...layers.behind, ...layers.front].map(row => row.line);
      unrenderedObjects = unrenderedObjects.filter(object => object.kindId !== 0x246c696e || painted.filter(line => line.section === object.section && line.anchorNode === object.componentNode).length !== 1);
    }
    return layout.state === "paginated" && unrenderedObjects.length ? { ...layout, objectCoverage: "incomplete", unrenderedObjects } : layout;
  } catch (error) { return { state: "unavailable", error: error.message }; }
}
