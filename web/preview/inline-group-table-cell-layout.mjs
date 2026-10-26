import { inlineGroupObject } from "./inline-group-object.mjs";
import { projectInlineObjectPages } from "./inline-object-page-projection.mjs";
import { layoutTableBodyContent } from "./table-body-content-layout.mjs";
import { drawingColumnContext } from "./drawing-column-context.mjs";
import { projectDrawingTextPage } from "./drawing-text-page-projection.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { sourceTableControlCoverage } from "./source-table-control-coverage.mjs";
import { drawingFillPlan } from "./drawing-fill-plan.mjs";
import { measureInlineGroupCell } from "./inline-group-cell-measurement.mjs";
import {
  groupCaptionParagraphKeys,
  projectInlineGroupCaption,
} from "./inline-group-caption-projection.mjs";

// Reserve native cell groups first; resolve their children only in final pages.
export function layoutInlineGroupTableCells(content, measure, maxRows = 20000) {
  const fail = (error) => ({ state: "unavailable", error });
  const roots = (content.containers ?? []).filter((root) => root.source?.group_context === null);
  const byNode = new Map(),
    hosts = new Map(),
    measuredHosts = new Map();
  if (!roots.length || content.pageSettings?.length !== 1 || content.createdTables?.length)
    return fail("UnsupportedCellGroupContent");
  for (const root of roots) {
    const object = inlineGroupObject(root, content.pageSettings[0].section_ordinal, {
      paragraphs: content.paragraphs,
      measure,
      maxRows,
    });
    if (object.state !== "measured") return object;
    const host = content.paragraphs.find(
      (p) => p.section === root.section && p.paragraph === root.hostParagraph,
    );
    if (
      !host?.tableCell ||
      host.text[root.anchorUnit] !== "\ufffc" ||
      byNode.has(root.containerNode)
    )
      return fail("InvalidCellGroupOwner");
    byNode.set(root.containerNode, { root, object });
    const key = `${root.section}:${root.hostParagraph}`,
      entries = hosts.get(key) ?? [];
    entries.push(object);
    hosts.set(key, entries);
  }
  if (
    (content.drawings ?? []).some(
      (d) =>
        !byNode.has(d.source?.group_context?.root_anchor) ||
        byNode.get(d.source.group_context.root_anchor)?.root.section !== d.section ||
        d.source.caption ||
        d.source.paint?.shadow_type !== 0,
    ) ||
    (content.pictures ?? []).some(
      (p) =>
        !p ||
        !Number.isSafeInteger(p.pictureNode) ||
        p.pictureNode < 0 ||
        p.owner?.anchorNode !== p.pictureNode ||
        p.owner.paragraph !== p.paragraph ||
        p.owner.anchorUnit !== p.anchorUnit ||
        p.section !== content.pageSettings[0].section_ordinal,
    )
  )
    return fail("UnsupportedCellGroupChildren");
  const captionKeys = groupCaptionParagraphKeys(roots, content.paragraphs);
  if (captionKeys === null) return fail("UnsupportedCellGroupCaptionOwnership");
  const drawingTextKeys = new Set(
    content.paragraphs
      .filter((p) => p.drawingText || captionKeys.has(`${p.section}:${p.paragraph}`))
      .map((p) => `${p.section}:${p.paragraph}`),
  );
  const core = {
    ...content,
    drawings: [],
    containers: [],
    paragraphs: content.paragraphs.filter(
      (p) => !drawingTextKeys.has(`${p.section}:${p.paragraph}`),
    ),
    paragraphFlows: content.paragraphFlows.filter(
      (flow) => !drawingTextKeys.has(`${flow.section}:${flow.paragraph}`),
    ),
  };
  return layoutTableBodyContent(core, measure, maxRows, {
    measureCellFlow(input) {
      return measureInlineGroupCell(core, input, hosts, byNode, measuredHosts);
    },
    completeLayout(page) {
      const rows = page.rows.map((row) => ({ ...row })),
        placedContainers = [],
        placedDrawings = [];
      if (measuredHosts.size !== hosts.size) return fail("MissingCellGroupHost");
      for (const flow of measuredHosts.values()) {
        const projection = projectInlineObjectPages(flow, rows);
        if (projection.state !== "placed") return projection;
        for (const placement of projection.objects) {
          const { root, object } = byNode.get(placement.objectNode),
            paper = placement.referenceBoxes?.paper,
            box = placement.rectangle;
          if (
            !paper ||
            ![paper.x, paper.y, paper.width, paper.height].every(Number.isFinite) ||
            paper.width <= 0 ||
            paper.height <= 0 ||
            box.x < paper.x ||
            box.y < paper.y ||
            box.x + box.width > paper.x + paper.width + 1e-8 ||
            box.y + box.height > paper.y + paper.height + 1e-8
          )
            return fail("CellGroupPaperOverflow");
          const hostRows = rows.filter(
            (row) =>
              row.kind === "text" &&
              row.section === placement.section &&
              row.paragraph === placement.paragraph &&
              row.startUnit <= placement.unit &&
              placement.unit < row.endUnit,
          );
          if (hostRows.length !== 1) return fail("AmbiguousCellGroupHost");
          const current = {
            ...placement,
            rectangle: {
              x: box.x + object.left,
              y: box.y + object.top,
              width: hwpUnitPixels(root.source.geometry.width),
              height: hwpUnitPixels(root.source.geometry.height),
            },
          };
          hostRows[0].inlineGroupPlacements = [
            ...(hostRows[0].inlineGroupPlacements ?? []),
            current,
          ];
          placedContainers.push({
            ...current,
            containerNode: root.containerNode,
            outerRectangle: { ...box },
          });
          const caption = projectInlineGroupCaption(root, object, placement, {
            maxRows: maxRows - rows.length,
          });
          if (caption.state !== "placed") return caption;
          rows.push(...caption.rows);
        }
      }
      for (const drawing of content.drawings ?? []) {
        const context = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
        if (context.state !== "selected") return context;
        const fill = drawingFillPlan(content, drawing);
        if (fill.state === "unavailable") return fill;
        if (rows.length >= maxRows) return fail("CellGroupProjectionLimit");
        const text = projectDrawingTextPage(
          drawing,
          content.containers,
          content.paragraphs,
          context.declaration,
          rows,
          measure,
          { maxRows: maxRows - rows.length, overflow: "extend-last-column" },
        );
        if (text.state !== "placed") return text;
        const host = rows.find(
          (row) =>
            row.kind === "text" &&
            row.section === drawing.section &&
            row.paragraph === drawing.hostParagraph &&
            row.startUnit <= drawing.anchorUnit &&
            drawing.anchorUnit < row.endUnit,
        );
        if (
          !host ||
          text.rows.some(
            (row) => row.y < host.y - 1e-8 || row.y + row.height > host.y + host.height + 1e-8,
          )
        )
          return fail("CellGroupTextReservationOverflow");
        rows.push(
          ...text.rows.map((row) =>
            text.overflowed === true ? { ...row, drawingTextOverflow: "extend-last-column" } : row,
          ),
        );
        placedDrawings.push({
          section: drawing.section,
          drawingNode: drawing.drawingNode,
          hostParagraph: drawing.hostParagraph,
          anchorUnit: drawing.anchorUnit,
          pageOrdinal: text.pageOrdinal,
          rectangle: text.rectangle,
          fill,
        });
      }
      const controls = sourceTableControlCoverage(content, page, rows);
      if (controls.state !== "verified") return controls;
      const coverage = pageParagraphCoverage(content.paragraphs, [...rows, ...controls.rows]);
      if (coverage.state !== "complete") {
        const groups = new Map();
        for (const row of [...rows, ...controls.rows]) {
          const key = `${row.section}:${row.paragraph}`,
            group = groups.get(key) ?? [];
          group.push(row);
          groups.set(key, group);
        }
        const failed = content.paragraphs.find(
          (p) =>
            pageParagraphCoverage([p], groups.get(`${p.section}:${p.paragraph}`) ?? []).state !==
            "complete",
        );
        return {
          ...coverage,
          layoutStage: "cell-group-completion",
          section: failed?.section,
          paragraph: failed?.paragraph,
        };
      }
      return {
        ...page,
        rows,
        placedContainers,
        placedDrawings,
        pageLayoutMode: "measured-cell-group-body",
        spatialRows: true,
      };
    },
  });
}
