import { nestedPictureTableSeparation } from './nested-picture-table-separation.mjs';
import { validateNestedTableOwnership } from './nested-table-ownership.mjs';
import { tableGeometryFailureEvidence } from './table-geometry-failure-evidence.mjs';
import { measureTableCells } from './table-cell-measurement.mjs';
import { layoutContent } from './layout.mjs';
import { measureInlineObjectParagraph } from './inline-object-paragraph-measurement.mjs';
import { layoutInlineTablePageContent } from './inline-table-page-content.mjs';
import { tableSourceHorizontalLayout } from './table-source-horizontal-layout.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { reserveNestedFloatingFlow } from './nested-floating-flow-reservation.mjs';
import {
  inspectNestedCellPictureSources,
  measureNestedCellPictureParagraph,
} from './nested-cell-picture-flow.mjs';
import { measureNestedInlineTableObject } from './nested-inline-table-object-measurement.mjs';
import { flowNestedBlockText } from './nested-block-text-flow.mjs';

// 자식 표 크기를 선행 측정하고 현재 UTF-16 앵커에 부모 셀 흐름을 결합합니다.
export const MAX_NESTED_TABLE_DEPTH = 64;
export function measureNestedTable(
  content,
  root,
  measure,
  {
    maxRows = 20000,
    maxDepth = MAX_NESTED_TABLE_DEPTH,
    overflow = 'reject',
    minimumCellHeight,
    measureCellFlow,
    completeCellFlow,
    pictureReferences,
    deferMultilineAlignment = false,
  } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    typeof measure !== 'function' ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 1 ||
    !['reject', 'clip', 'visible'].includes(overflow)
  )
    return unavailable('InvalidNestedTableMeasurement');
  if (measureCellFlow !== undefined && typeof measureCellFlow !== 'function')
    return unavailable('InvalidNestedTableMeasurement');
  let index;
  try {
    index = validateNestedTableOwnership(content);
  } catch {
    return unavailable('InvalidNestedTableFlow');
  }
  if (index.tables.get(`${root?.section}:${root?.tableNode}`) !== root)
    return unavailable('InvalidNestedTableMeasurement');
  const hosts = new Map();
  for (const table of index.tables.values()) {
    if (table.parentTableNode == null) continue;
    const key = `${table.section}:${table.parentTableNode}:${table.parentListNode}:${table.hostParagraph}`;
    const children = hosts.get(key) ?? [];
    children.push(table);
    hosts.set(key, children);
  }
  const measureTable = (table, budget, depth) => {
    if (depth > maxDepth) return unavailable('NestedTableMeasurementLimit');
    const source = tableSourceHorizontalLayout(table);
    if (source.state !== 'resolved')
      return { ...source, section: table.section, tableNode: table.tableNode };
    const measuredTable = measureTableCells(table, content.paragraphs, measure, {
      origin: { x: 0, y: 0 },
      padding: 'source',
      maxRows: budget,
      compactLines: true,
      minimumCellHeight,
      ...source.gridOptions,
      minimumRowHeight: 0,
      deferMultilineAlignment: table === root && deferMultilineAlignment,
      paragraphFlows: content.paragraphFlows,
      pictures: content.pictures ?? [],
      pictureReferences,
      completeCellFlow,
      measureCellFlow(input) {
        const supplied = measureCellFlow?.(input);
        if (supplied != null) return supplied;
        if (
          !input.paragraphs.some((p) =>
            hosts.has(`${table.section}:${table.tableNode}:${input.cell.listNode}:${p.paragraph}`),
          )
        )
          return null;
        if (input.columnContext?.declaration?.count > 1)
          return {
            ...unavailable('UnsupportedNestedCellContent'),
            section: table.section,
            tableNode: table.tableNode,
            listNode: input.cell.listNode,
            nestedCellReason: 'columns-with-nested-tables',
          };
        const pictureSources = inspectNestedCellPictureSources(input);
        if (pictureSources.state !== 'indexed')
          return {
            ...pictureSources,
            section: table.section,
            tableNode: table.tableNode,
            listNode: input.cell.listNode,
          };
        const { pictures, floating: floatingPictures } = pictureSources;
        const flowPictures = [];
        const rows = [],
          boxes = [],
          floatingTables = [],
          inlineCaptions = [],
          columnEvidence = [],
          nestedPictures = [];
        let height = 0;
        for (const paragraph of input.paragraphs) {
          const children =
            hosts.get(
              `${table.section}:${table.tableNode}:${input.cell.listNode}:${paragraph.paragraph}`,
            ) ?? [];
          const entries = [],
            measured = new Map();
          const floatingUnits = new Set();
          const paragraphFloats = [];
          for (const child of children) {
            if (!child.sourceGeometry?.geometry) {
              return {
                ...unavailable('MissingTableGeometry'),
                section: child.section,
                tableNode: child.tableNode,
                parentTableNode: table.tableNode,
                nestedAnchorReason: 'missing-geometry',
                ...tableGeometryFailureEvidence(child, content.tableGeometryErrors),
              };
            }
            const floating = child.sourceGeometry?.geometry?.treat_as_character === false;
            if (
              (floating && child.sourceCaption) ||
              (floating
                ? ![1, 2, 3].includes(child.sourceGeometry.text_wrap) ||
                  child.sourceGeometry.affect_line_spacing !== false
                : child.sourceGeometry?.geometry?.treat_as_character !== true)
            )
              return {
                ...unavailable('UnsupportedNestedTableAnchor'),
                section: child.section,
                tableNode: child.tableNode,
                parentTableNode: table.tableNode,
                nestedAnchorReason: child.sourceCaption
                  ? 'caption'
                  : floating && ![1, 2, 3].includes(child.sourceGeometry.text_wrap)
                    ? 'wrap'
                    : floating
                      ? 'line-spacing'
                      : 'inline-geometry',
              };
            const raw = child.sourceGeometry.out_margin;
            if (
              !Array.isArray(raw) ||
              raw.length !== 4 ||
              !raw.every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff)
            )
              return unavailable('MissingTableOuterInsets');
            const remaining = input.maxRows - rows.length;
            if (remaining < 1) return unavailable('TableCellMeasurementLimit');
            const childFlow = measureTable(child, remaining, depth + 1);
            if (childFlow.state !== 'measured') return childFlow;
            if ([...childFlow.flows.values()].some((flow) => flow.cellPageBreaks?.length))
              return unavailable('UnsupportedNestedCellPageBreak');
            columnEvidence.push(...(childFlow.columnEvidence ?? []));
            if ([...childFlow.flows.values()].some((flow) => flow.floatingTables?.length))
              return unavailable('UnsupportedNestedFloatingDepth');
            if (floating) {
              if (
                !Number.isInteger(child.anchorUnit) ||
                child.anchorUnit < 0 ||
                paragraph.text[child.anchorUnit] !== '\ufffc' ||
                floatingUnits.has(child.anchorUnit)
              )
                return unavailable('InvalidNestedFloatingTableOwner');
              floatingUnits.add(child.anchorUnit);
              const descriptor = { table: child, paragraph, measured: childFlow };
              floatingTables.push(descriptor);
              paragraphFloats.push(descriptor);
              continue;
            }
            const object = measureNestedInlineTableObject(
              child,
              childFlow,
              content.paragraphs,
              measure,
              remaining,
            );
            if (object.state !== 'object-measured') return object;
            measured.set(child.tableNode, {
              child,
              childFlow,
              margins: object.outerInsets,
              captionReservation: object.captionReservation,
            });
            entries.push({
              objectNode: child.tableNode,
              unit: child.anchorUnit,
              width: object.width,
              height: object.height,
            });
          }
          if (rows.length >= input.maxRows) return unavailable('TableCellMeasurementLimit');
          const paragraphPictures = [...pictures.values()].filter(
            (item) =>
              item.picture.section === paragraph.section &&
              item.picture.paragraph === paragraph.paragraph,
          );
          const pictureNodes = new Set(paragraphPictures.map((item) => item.picture.pictureNode));
          const inlineEntries = [
            ...entries,
            ...paragraphPictures.map((item) => ({
              objectNode: item.picture.pictureNode,
              unit: item.picture.anchorUnit,
              width: item.width,
              height: item.height,
            })),
          ];
          const currentMeasure = (text, owner, unit, kind) =>
            floatingUnits.has(unit) && kind === 'text'
              ? { ...textMeasurement(measure('', owner, unit, kind)), width: 0 }
              : measure(text, owner, unit, kind);
          const pictureFlow =
            floatingPictures.some(
              (p) => p.section === paragraph.section && p.paragraph === paragraph.paragraph,
            ) || flowPictures.length;
          if (pictureFlow && paragraphFloats.length) {
            const separation = nestedPictureTableSeparation(
              paragraph,
              paragraphFloats,
              floatingPictures,
              flowPictures,
              height,
              input.width,
            );
            if (separation.state !== 'separated')
              return {
                ...separation,
                section: table.section,
                tableNode: table.tableNode,
                listNode: input.cell.listNode,
                paragraph: paragraph.paragraph,
              };
          }
          let flow = pictureFlow
            ? measureNestedCellPictureParagraph(
                {
                  ...input,
                  captionParagraphs: content.paragraphs,
                  maxRows: input.maxRows - rows.length,
                },
                paragraph,
                inlineEntries,
                [...floatingUnits],
                height,
                floatingPictures,
                flowPictures,
                overflow,
              )
            : inlineEntries.length
              ? measureInlineObjectParagraph(paragraph, inlineEntries, input.width, measure, {
                  maxRows: input.maxRows - rows.length,
                  allowLineOverflow: overflow !== 'reject',
                  compactLines: true,
                  includeTerminalAfter: paragraph !== input.paragraphs.at(-1),
                  zeroWidthUnits: [...floatingUnits],
                })
              : layoutContent(
                  { paragraphs: [paragraph], limited: false },
                  input.width,
                  currentMeasure,
                  input.maxRows - rows.length,
                  {
                    documentBody: true,
                    compactLines: true,
                    includeTerminalAfter: paragraph !== input.paragraphs.at(-1),
                  },
                );
          if (flow.state === 'unavailable')
            return {
              ...flow,
              section: table.section,
              tableNode: table.tableNode,
              listNode: input.cell.listNode,
              paragraph: paragraph.paragraph,
              availableWidth: input.width,
              objects: inlineEntries.map((entry) => ({
                objectNode: entry.objectNode,
                unit: entry.unit,
                width: entry.width,
                height: entry.height,
              })),
            };
          if (flow.limited) return unavailable('TableCellMeasurementLimit');
          if (pictureFlow) flowPictures.push(...(flow.flowPictures ?? []));
          if (paragraphFloats.length && !inlineEntries.length) {
            const wrapped = flowNestedBlockText(paragraph, flow, paragraphFloats, input.width);
            if (wrapped.state === 'unavailable') return wrapped;
            flow = wrapped.flow;
          }
          const reservation = paragraphFloats.length
            ? reserveNestedFloatingFlow(paragraph, flow, paragraphFloats, { x: 0, y: height })
            : { state: 'reserved', bottom: height + flow.height };
          if (reservation.state !== 'reserved') return reservation;
          rows.push(
            ...flow.rows.map((row) => ({
              ...row,
              y: height + row.y,
              ...(entries.length || floatingUnits.size
                ? {
                    inlineTables: [
                      ...entries.map((entry) => ({
                        tableNode: entry.objectNode,
                        unit: entry.unit,
                      })),
                      ...children
                        .filter((child) => floatingUnits.has(child.anchorUnit))
                        .map((child) => ({ tableNode: child.tableNode, unit: child.anchorUnit })),
                    ],
                  }
                : {}),
            })),
          );
          for (const anchor of flow.anchors ?? []) {
            if (pictureNodes.has(anchor.objectNode)) continue;
            if (rows.length >= input.maxRows) return unavailable('TableCellMeasurementLimit');
            const { child, childFlow, margins, captionReservation } = measured.get(
              anchor.objectNode,
            );
            const column = {
              x: 0,
              y: 0,
              width: input.width,
              height: Math.max(input.height, height + flow.height),
            };
            const placement = {
              objectNode: child.tableNode,
              section: child.section,
              paragraph: child.hostParagraph,
              unit: child.anchorUnit,
              pageOrdinal: 0,
              columnOrdinal: 0,
              rectangle: {
                x: anchor.x,
                y: height + anchor.y,
                width: anchor.width,
                height: anchor.height,
              },
              referenceBoxes: { column },
            };
            const projected = layoutInlineTablePageContent(child, childFlow, placement, margins, {
              maxRows: input.maxRows - rows.length,
              captionReservation,
            });
            if (projected.state !== 'placed') return projected;
            if (captionReservation) inlineCaptions.push({ table: child, projection: projected });
            if (projected.tableCaptionBounds?.some((bound) => bound.tableNode !== child.tableNode))
              return unavailable('UnsupportedNestedCaptionDepth');
            rows.push(...projected.rows);
            boxes.push(...projected.boxes);
            nestedPictures.push(...(projected.flowPictures ?? []));
          }
          height = reservation.bottom;
        }
        for (const picture of flowPictures)
          if ([0, 1].includes(picture.flow?.textWrap))
            height = Math.max(
              height,
              (picture.flowRectangle ?? picture.rectangle).y +
                (picture.flowRectangle ?? picture.rectangle).height,
            );
        return {
          rows,
          boxes,
          height,
          ...(flowPictures.length ? { flowPictures } : {}),
          width: input.width,
          limited: false,
          spatialRows: true,
          clipOverflow: overflow === 'clip',
          ...(nestedPictures.length ? { nestedPictures } : {}),
          ...(columnEvidence.length ? { columnEvidence } : {}),
          ...(inlineCaptions.length ? { inlineCaptions } : {}),
          ...(overflow === 'visible' ? { visibleHorizontalOverflow: true } : {}),
          ...(floatingTables.length ? { floatingTables } : {}),
        };
      },
    });
    if (measuredTable.state !== 'measured') return measuredTable;
    const columnEvidence = [
      ...(source.evidence
        ? [{ section: table.section, tableNode: table.tableNode, ...source.evidence }]
        : []),
      ...[...measuredTable.flows.values()].flatMap((flow) => flow.columnEvidence ?? []),
    ];
    return columnEvidence.length ? { ...measuredTable, columnEvidence } : measuredTable;
  };
  return measureTable(root, maxRows, 0);
}
