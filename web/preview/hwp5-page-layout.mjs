import {projectOpaqueHwp5Tables} from "./hwp5-opaque-table-preview.mjs";
import { hwp5PageGeometry } from "./hwp5-page-geometry.mjs";
import { projectHwp5ColumnFlow } from "./hwp5-column-flow.mjs";
import { layoutPageContent } from "./page-content-layout.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { hwp5EffectivePageNumberSource, hwp5EffectiveSectionPageNumberSource } from "./hwp5-document-numbering.mjs";
import { projectHwp5RootContent } from "./hwp5-root-content-projection.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { hwp5SectionExtensionSupported, hwp5SectionExtensionUnverified } from "./hwp5-section-extension-policy.mjs";
import { hwp5SectionDisplayFlags } from "./hwp5-section-display-flags.mjs";
import { previewLineLayers } from "./line-layers.mjs";
import { projectHwp5MasterPages } from "./hwp5-master-page-projection.mjs";
import { layoutMasterPageRows } from "./master-page-flow.mjs";
import { selectHwp5MemoPane } from "./hwp5-memo-pane-content.mjs";
import { attachHwp5MemoPane } from "./hwp5-memo-pane-layout.mjs";
import { withHwp5LineOverlayAnchors } from "./hwp5-line-overlay-anchors.mjs";
import { hasObservedDrawingObjectExtension } from "./hwp5-drawing-object-extension.mjs";
import { withHwp5PageAreaDeclarations } from "./hwp5-page-area-declarations.mjs";
/** Measured preview under observed default section settings; not Hancom pagination. */
export function layoutHwp5PageContent(content, measure, maxRows = 20000, options = {}) {
  try {
    if (options.observedDrawingPreview !== undefined && typeof options.observedDrawingPreview !== "boolean") return { state: "unavailable", error: "InvalidObservedDrawingPolicy" };
    const unverifiedDrawingSources = (content.hwp5Drawings ?? []).filter(row => hasObservedDrawingObjectExtension(row.source))
      .map(row => ({ section: row.section, controlNode: row.controlNode, componentNode: row.componentNode, ...row.source.observedObjectExtension }));
    if (options.observedDrawingPreview === false && unverifiedDrawingSources.length) return { state: "unavailable", error: "UnsupportedHwp5DrawingObjectExtension" };
    if(options.opaqueTablePreview!==undefined&&typeof options.opaqueTablePreview!=="boolean")return {state:"unavailable",error:"InvalidOpaqueTablePolicy"};
    if(options.observedSectionPreview!==undefined&&typeof options.observedSectionPreview!=="boolean")return {state:"unavailable",error:"InvalidObservedSectionPolicy"};
    const opaque=options.opaqueTablePreview===false?{content,unverified:[]}:projectOpaqueHwp5Tables(content);
    content=opaque.content;
    if (content.pageControlSourceErrors?.length) return { state: "unavailable", error: "IncompleteHwp5PageNumberControls" };
    if (content.pageControlSources?.length && options.pageNumbers !== undefined) return { state: "unavailable", error: "UnsupportedHwp5ControlledPageOverride" };
    const masterProjection = projectHwp5MasterPages(content);
    content = masterProjection.content;
    let unrenderedObjects = [];
    const roots = projectHwp5RootContent(content);
    if (roots.state === "unavailable") return roots;
    if (roots.state === "projected") {
      content = roots.content;
      unrenderedObjects = (content.hwp5Drawings ?? []).filter(row => row.source.kind_id === 0x246c696e)
        .map(row => ({ section: row.section, componentNode: row.componentNode, kindId: row.source.kind_id }));
    }
    else {
      // Retain the existing body/table preview, but never claim the omitted objects.
      unrenderedObjects = content.hwp5Drawings.filter(row => !(content.pictures ?? []).some(picture => picture.section === row.section && picture.pictureNode === row.componentNode && picturePaintPlan(picture).state !== "unsupported_transform"))
        .map(row => ({ section: row.section, componentNode: row.componentNode, kindId: row.source.kind_id }));
    }
    const memoPane = selectHwp5MemoPane(content);
    if (memoPane.state !== "selected") return memoPane;
    content = memoPane.content;
    if (content.pageSourceErrors?.length || content.sectionSourceErrors?.length || !content.pageSources?.length || !content.sectionSources?.length) {
      const openFailed = content.editorSessionAvailable === false && ["RepairedSourceUnsupported", "UnexpectedEnd", "ResourceCountMismatch"].includes(content.characterShapesError);
      return { state: "unavailable", error: "MissingHwp5PageSources",
        ...(openFailed ? { sourceError: content.characterShapesError, layoutStage: "editor-open" } : {}) };
    }
    const sections = new Map(), sectionDisplay = new Map(), unverifiedSections = [];
    for (const source of content.sectionSources) {
      if (sections.has(source.section)) throw new Error("AmbiguousHwp5SectionSources");
      const masterGroup = masterProjection.groups.find(group => group.section === source.section);
      const display = hwp5SectionDisplayFlags(source, content, Boolean(masterGroup));
      if (!display.supported || source.vertical_grid !== 0 || source.horizontal_grid !== 0) return {
        state: "unavailable", error: "UnsupportedHwp5SectionLayout", section: source.section,
        rawSectionFlags: source.flags, verticalGrid: source.vertical_grid, horizontalGrid: source.horizontal_grid };
      // Explicit observed zero-tail profile, not universal extension trimming.
      if (!hwp5SectionExtensionSupported(source, memoPane.counts.get(source.section) ?? 0)) throw new Error("UnsupportedHwp5SectionExtension");
      if (hwp5SectionExtensionUnverified(source)) {
        if (options.observedSectionPreview === false) throw new Error("UnsupportedHwp5SectionExtension");
        unverifiedSections.push({ section: source.section, fileVersion: source.fileVersion, extraBytes: source.extra_bytes });
      }
      if (!Number.isInteger(source.column_gap) || source.column_gap < 0) throw new Error("UnsupportedHwp5SectionGap");
      sections.set(source.section, source);
      sectionDisplay.set(source.section, display);
    }
    const seen = new Set();
    const pageSettings = content.pageSources.map(source => {
      if (seen.has(source.section) || !sections.has(source.section)) throw new Error("AmbiguousHwp5PageSources");
      seen.add(source.section);
      return { ...hwp5PageGeometry(source), column_zone_gap: hwpUnitPixels(sections.get(source.section).column_gap),
        hide_first_empty_line: sectionDisplay.get(source.section).hideFirstEmptyLine };
    });
    if (seen.size !== sections.size) throw new Error("MissingHwp5PageSources");
    const paragraphFlows = projectHwp5ColumnFlow(content, { tableCells: Boolean(content.tables?.length), pageAreas: true, notes: true, captions: true,
      drawings: Boolean(content.drawings?.length || content.paragraphs.some(row => row.drawingText || row.drawingCaption)) });
    if (options.pageNumbers === undefined && (paragraphFlows.some(row => ["header", "footer"].includes(row.host)) || content.pageControlSources?.length || masterProjection.groups.some(group => group.profile.apply !== "both"))) {
      const numbering = content.sectionSources.length > 1 || masterProjection.groups.length
        ? hwp5EffectiveSectionPageNumberSource(content) : hwp5EffectivePageNumberSource(content);
      if (numbering.page_controls?.length || numbering.section_starts?.length) content = { ...content, hwp5PageNumberSource: numbering };
      for (const row of paragraphFlows) if (["header", "footer"].includes(row.host)) row.page_number_source = numbering;
    }
    if (paragraphFlows.some(row => !seen.has(row.section))) throw new Error("MissingHwp5PageSources");
    content = withHwp5LineOverlayAnchors(content);
    content = withHwp5PageAreaDeclarations(content);
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
    if(layout.state==="paginated"&&opaque.unverified.length){layout.sourceCoverage="incomplete";layout.unverifiedTableSources=opaque.unverified;}
    if(layout.state==="paginated"&&unverifiedSections.length){layout.sourceCoverage="incomplete";layout.unverifiedSectionSources=unverifiedSections;}
    if(layout.state==="paginated"&&unverifiedDrawingSources.length){layout.sourceCoverage="incomplete";layout.unverifiedDrawingSources=unverifiedDrawingSources;}
    const annotated = layout.state === "paginated" ? attachHwp5MemoPane(layout, memoPane, measure, { maxRows }) : layout;
    return annotated.state === "paginated" && unrenderedObjects.length ? { ...annotated, objectCoverage: "incomplete", unrenderedObjects } : annotated;
  } catch (error) {
    const evidence = {};
    if (error.message === "IncompleteHwp5CaptionSources") {
      const source = content.hwp5CaptionGeometryErrors?.[0] ?? content.hwp5CaptionErrors?.[0];
      if (typeof source?.error === "string") evidence.sourceError = source.error.slice(0, 256);
      for (const key of ["section", "tableNode", "listNode", "rawCaptionFlags", "rawCaptionAttributes"]) {
        if (Number.isInteger(source?.[key]) && source[key] >= 0 && source[key] <= 0xffffffff) evidence[key] = source[key];
      }
    }
    return { state: "unavailable", error: error.message, ...evidence };
  }
}
