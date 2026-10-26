import { paragraphKeepRows } from './paragraph-keep-rows.mjs';
import { paragraphStylePageBreaks } from './paragraph-style-page-break.mjs';
import { layoutContent } from './layout.mjs';
import { pageReferenceBoxes } from './page-reference-boxes.mjs';
import { paginateBodyRows } from './page-row-flow.mjs';
import { composePageAreaBody } from './page-area-body-composition.mjs';
import { measureColumnContent } from './column-content-layout.mjs';
import { layoutPageSections } from './page-section-layout.mjs';
import { layoutTableBodyContent } from './table-body-content-layout.mjs';
import { layoutDrawingBodyContent } from './drawing-body-content-layout.mjs';
import { layoutPictureBodyContent } from './picture-body-content-layout.mjs';
import { layoutMixedInlineBody } from './mixed-inline-body-layout.mjs';
import { layoutNoteBodyPages } from './note-body-page-layout.mjs';
import { layoutObjectFootnoteContent } from './object-footnote-content-layout.mjs';
import { layoutHwp5ControlledPages } from './hwp5-controlled-page-layout.mjs';
import { layoutCreatedTableInlinePages } from './created-table-inline-page-layout.mjs';
import { selectNoteSourceTables } from './note-source-table-owners.mjs';
import { layoutInlineGroupBody } from './inline-group-body-layout.mjs';
import { layoutFloatingPictureGroupBody } from './floating-picture-group-body.mjs';
import { floatingTableOwnsPictureGroups } from './floating-table-picture-groups.mjs';
import { layoutInlineGroupTableCells } from './inline-group-table-cell-layout.mjs';
import { layoutChartPageContent } from './chart-page-layout.mjs';
import { layoutEllipseBody } from './ellipse-body-layout.mjs';
import { curvePageCompositionConnected } from './curve-page-composition-policy.mjs';
import { isOverlayTable, layoutOverlayTableBody } from './overlay-table-body-layout.mjs';
import { layoutGroupDrawingBody } from './group-drawing-body-layout.mjs';

/** Physical-page flow for the currently supported single-section body path. */
export function layoutPageContent(
  content,
  measure,
  maxRows = 20000,
  {
    pageNumbers,
    minimumCellHeight,
    rowY,
    minimumRowPage,
    columnBottom,
    paginateRows,
    chartDisplay,
  } = {},
) {
  content = paragraphStylePageBreaks(content);
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (columnBottom !== undefined && typeof columnBottom !== 'function')
    return unavailable('InvalidPageFlowBounds');
  if (paginateRows !== undefined && typeof paginateRows !== 'function')
    return unavailable('InvalidPageFlowBounds');
  if (
    content.pageSettingsError ||
    content.paragraphFlowErrors?.length ||
    !content.pageSettings?.length
  )
    return unavailable('AmbiguousPageSettings');
  if (content.curveTextSourceErrors?.length) {
    const source = content.curveTextSourceErrors[0],
      evidence = {};
    if (Number.isSafeInteger(source?.section) && source.section >= 0)
      evidence.section = source.section;
    if (Number.isSafeInteger(source?.curveNode) && source.curveNode >= 0)
      evidence.drawingNode = source.curveNode;
    if (typeof source?.error === 'string') evidence.sourceError = source.error.slice(0, 256);
    return { ...unavailable('IncompleteCurveTextSources'), ...evidence };
  }
  if (content.curveTextSources?.length) {
    const connected = curvePageCompositionConnected(content, [
      pageNumbers,
      minimumCellHeight,
      rowY,
      minimumRowPage,
      columnBottom,
      paginateRows,
    ]);
    if (!connected)
      return {
        ...unavailable('UnsupportedCurveTextPageComposition'),
        section: content.curveTextSources[0].section,
        drawingNode: content.curveTextSources[0].curveNode,
      };
  }
  if (content.ellipseSourceErrors?.length) return unavailable('IncompleteEllipseSources');
  if (content.ellipses?.length)
    return layoutEllipseBody(
      content,
      measure,
      maxRows,
      (body, bodyMeasure, budget) =>
        layoutPageContent(body, bodyMeasure, budget, {
          pageNumbers,
          minimumCellHeight,
          rowY,
          minimumRowPage,
          columnBottom,
          paginateRows,
          chartDisplay,
        }),
      { minimumCellHeight },
    );
  if (content.pictureCaptionErrors?.length) return unavailable('AmbiguousPictureCaptionContent');
  if (content.containerCaptionErrors?.length)
    return unavailable('AmbiguousContainerCaptionContent');
  if (content.pictures?.some((p) => p.captionPartial))
    return unavailable('IncompletePictureCaptionContent');
  if (content.oleSourceErrors?.length) return unavailable('IncompleteOlePageContent');
  if (content.oles?.length) {
    if (typeof chartDisplay === 'function') {
      if ([rowY, minimumRowPage, columnBottom, paginateRows].some((value) => value !== undefined))
        return unavailable('UnsupportedNestedChartPageFlow');
      return layoutChartPageContent(
        content,
        measure,
        maxRows,
        chartDisplay,
        (body, bodyMeasure, limit, options) =>
          layoutPageContent(body, bodyMeasure, limit, {
            pageNumbers,
            minimumCellHeight,
            ...options,
          }),
      );
    }
    return {
      ...unavailable('UnsupportedOlePageContent'),
      section: content.oles[0].section,
      oleNode: content.oles[0].oleNode,
    };
  }
  // A reservation must never silently disappear in an unconnected paginator.
  if (
    (columnBottom !== undefined || paginateRows !== undefined) &&
    (content.createdTables?.length ||
      content.pageSettings.length > 1 ||
      content.hwp5PageNumberSource?.page_controls?.length ||
      content.hwp5PageNumberSource?.section_starts?.length ||
      content.paragraphFlows?.some((flow) => ['footnote', 'endnote'].includes(flow.host)))
  )
    return unavailable('UnsupportedPageColumnReservation');
  if (content.createdTables?.length) {
    if (pageNumbers !== undefined) return unavailable('UnsupportedCreatedTablePageNumbers');
    if (
      content.hwp5PageNumberSource?.page_controls?.length ||
      content.hwp5PageNumberSource?.section_starts?.length
    )
      return layoutHwp5ControlledPages(content, measure, maxRows, layoutPageContent);
    if (
      content.pageSettings.length > 1 &&
      !content.paragraphFlows?.some((flow) => ['footnote', 'endnote'].includes(flow.host))
    )
      return layoutPageSections(content, measure, maxRows, layoutPageContent);
    return content.paragraphFlows?.some((flow) => ['footnote', 'endnote'].includes(flow.host))
      ? layoutNoteBodyPages(content, measure, maxRows)
      : layoutCreatedTableInlinePages(content, measure, maxRows);
  }
  if (
    content.hwp5PageNumberSource?.page_controls?.length ||
    content.hwp5PageNumberSource?.section_starts?.length
  ) {
    if (pageNumbers !== undefined) return unavailable('UnsupportedHwp5ControlledPageOverride');
    return layoutHwp5ControlledPages(content, measure, maxRows, layoutPageContent);
  }
  if (content.paragraphFlows?.some((flow) => ['footnote', 'endnote'].includes(flow.host))) {
    // Footnotes are section-local. Document-end endnotes cannot be scoped this way.
    if (
      ['hwp5', 'hwpx'].includes(content.format) &&
      content.pageSettings.length > 1 &&
      !content.paragraphFlows.some((flow) => flow.host === 'endnote')
    ) {
      if (pageNumbers !== undefined) return unavailable('UnsupportedSectionPageNumbers');
      return layoutPageSections(content, measure, maxRows, layoutPageContent);
    }
    const objects =
      content.tables?.length ||
      content.drawings?.length ||
      content.pictures?.length ||
      content.lines?.length ||
      content.containers?.length ||
      content.curveTextSources?.length;
    if (!objects) return layoutNoteBodyPages(content, measure, maxRows);
    if (content.paragraphFlows.some((flow) => ['header', 'footer'].includes(flow.host)))
      return composePageAreaBody(content, measure, maxRows, layoutPageContent, {
        pageNumbers,
        minimumCellHeight,
        rowY,
        minimumRowPage,
      });
    if (
      content.tables?.length &&
      !content.drawings?.length &&
      !content.pictures?.length &&
      !content.lines?.length &&
      !content.containers?.length &&
      !content.curveTextSources?.length &&
      selectNoteSourceTables(content, { floatingNotes: true }).state === 'selected'
    )
      return layoutNoteBodyPages(content, measure, maxRows);
    return layoutObjectFootnoteContent(content, measure, maxRows, layoutPageContent);
  }
  if (content.pageSettings.length > 1) {
    if (pageNumbers !== undefined) return unavailable('UnsupportedSectionPageNumbers');
    return layoutPageSections(content, measure, maxRows, layoutPageContent);
  }
  if (content.paragraphFlows?.some((flow) => ['header', 'footer'].includes(flow.host)))
    return composePageAreaBody(content, measure, maxRows, layoutPageContent, {
      pageNumbers,
      minimumCellHeight,
      rowY,
      minimumRowPage,
      columnBottom,
      paginateRows,
    });
  const layoutBody = (body, bodyMeasure, budget, options) =>
    layoutPageContent(body, bodyMeasure, budget, {
      ...options,
      columnBottom,
      ...(paginateRows ? { paginateRows } : {}),
    });
  if (content.tables?.some(isOverlayTable))
    return layoutOverlayTableBody(content, measure, maxRows, (body, bodyMeasure, budget) =>
      layoutPageContent(body, bodyMeasure, budget, {
        pageNumbers,
        minimumCellHeight,
        rowY,
        minimumRowPage,
        columnBottom,
        paginateRows,
        chartDisplay,
      }),
    );
  if (
    content.containers?.some(
      (row) =>
        row.source?.group_context === null && row.source.geometry?.treat_as_character === true,
    )
  ) {
    if (content.drawings?.some((d) => d.source?.group_context === null))
      return [rowY, minimumRowPage, columnBottom, paginateRows].some((value) => value !== undefined)
        ? unavailable('UnsupportedNestedGroupDrawingReservations')
        : layoutGroupDrawingBody(content, measure, maxRows, layoutBody);
    return columnBottom !== undefined || paginateRows !== undefined
      ? unavailable('UnsupportedPageColumnReservation')
      : content.containers
            .filter((row) => row.source?.group_context === null)
            .every((root) =>
              content.paragraphs.some(
                (p) =>
                  p.section === root.section && p.paragraph === root.hostParagraph && p.tableCell,
              ),
            )
        ? rowY !== undefined || minimumRowPage !== undefined
          ? unavailable('UnsupportedCellGroupReservations')
          : layoutInlineGroupTableCells(content, measure, maxRows)
        : layoutInlineGroupBody(content, measure, maxRows, { rowY, minimumRowPage });
  }
  if (
    !content.drawings?.length &&
    content.containers?.some(
      (root) =>
        root.source?.group_context === null &&
        root.source.geometry?.treat_as_character === false &&
        [0, 1].includes(root.source.flow?.text_wrap),
    ) &&
    !floatingTableOwnsPictureGroups(content)
  )
    return [rowY, minimumRowPage, columnBottom, paginateRows].some((value) => value !== undefined)
      ? unavailable('UnsupportedFloatingGroupReservations')
      : layoutFloatingPictureGroupBody(content, measure, maxRows, layoutBody);
  if (content.drawings?.length && content.tables?.length)
    return content.drawings.every((d) => d.source?.geometry?.treat_as_character === false)
      ? layoutDrawingBodyContent(content, measure, maxRows, layoutBody)
      : columnBottom !== undefined || paginateRows !== undefined
        ? unavailable('UnsupportedPageColumnReservation')
        : layoutMixedInlineBody(content, measure, maxRows);
  if (content.drawings?.length && !content.tables?.length)
    return layoutDrawingBodyContent(content, measure, maxRows, layoutBody);
  if (content.tables?.length)
    return layoutTableBodyContent(content, measure, maxRows, {
      minimumCellHeight,
      rowY,
      minimumRowPage,
      columnBottom,
      paginateRows,
    });
  if (content.pictures?.length)
    return layoutPictureBodyContent(content, measure, maxRows, {
      rowY,
      minimumRowPage,
      columnBottom,
      paginateRows,
    });
  if (
    content.tables?.length ||
    content.pictures?.length ||
    content.paragraphs.some((p) => p.tableCell || p.clipped)
  )
    return unavailable('UnsupportedPageObjects');
  const setting = content.pageSettings[0];
  if (!Number.isSafeInteger(setting.section_ordinal) || setting.section_ordinal < 0)
    return unavailable('AmbiguousPageSettings');
  if (content.paragraphs.some((p) => p.section !== setting.section_ordinal))
    return unavailable('UnsupportedPageSections');
  const reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== 'placed') return unavailable(reference.state);
  const body = content;
  const bodyFlows = content.paragraphFlows ?? [];
  const columnZones = !bodyFlows.every((flow) => flow.single_column === true);
  const measured = columnZones
    ? measureColumnContent(body, reference.boxes.page, bodyFlows, measure, maxRows)
    : layoutContent(body, reference.boxes.page.width, measure, maxRows, { documentBody: true });
  if (measured.state === 'unavailable') return measured;
  const options = {
    columnZones,
    zoneGap: setting.column_zone_gap ?? 0,
    measureRow: measured.measureRow,
    maxRows,
    rowY,
    minimumRowPage,
    columnBottom,
  };
  const rows =
    !columnZones && rowY === undefined && columnBottom === undefined && minimumRowPage === undefined
      ? paragraphKeepRows(measured.rows, bodyFlows, reference.boxes.page.height)
      : measured.rows;
  const paginated = paginateRows
    ? paginateRows(rows, setting, bodyFlows, options, paginateBodyRows)
    : paginateBodyRows(rows, setting, bodyFlows, options);
  if (paginated.state !== 'paginated') return paginated;
  return {
    ...paginated,
    pages: paginated.pages.map((page) => ({ ...page, section: setting.section_ordinal })),
    limited: measured.limited || paginated.limited,
    pageLayoutMode: 'measured-body',
  };
}
