import { createProjectionPairIndex, isProjectionDataOnly } from './projection-pair-index.mjs';
import { hwp5DrawingGeometry } from './hwp5-drawing-geometry.mjs';
import { validateHwp5DrawingAnchors } from '../../js/hwp5-drawing-anchors.mjs';
import { validateHwp5DrawingSources } from '../../js/hwp5-drawing-sources.mjs';
import { validateHwp5DrawingListSources } from '../../js/hwp5-drawing-list-sources.mjs';
import { sourceDisplayPosition, sourceTextChanges } from './text-offsets.mjs';
import { drawingAxisGeometry } from './drawing-axis-geometry.mjs';

const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
const identity = (m) =>
  Array.isArray(m) && m.length === 6 && [1, 0, 0, 0, 1, 0].every((v, i) => m[i] === v);
const noText = Object.freeze({ state: 'unavailable' });
const emptyText = Object.freeze({ state: 'available', paragraphs: Object.freeze([]) });
const noQuery = Object.freeze({ get: () => null });
const unique = (index, a, b) => {
  const hit = index.find(a, b);
  return hit.count === 1 ? hit.first : null;
};
const pair = (rows, a, b) => createProjectionPairIndex(rows, a, b);

/** One synchronous read of the current public observation. No selection/write authority or cross-state cache. */
export function createDrawingObservationQuery(content) {
  if (
    !content ||
    !['hwpx', 'hwp5'].includes(content.format) ||
    content.limited === true ||
    content.window ||
    !Array.isArray(content.drawings)
  )
    return noQuery;
  const h5 = content.format === 'hwp5';
  const names = [
    'drawings',
    'paragraphs',
    ...(h5
      ? [
          'hwp5Drawings',
          'hwp5DrawingLocalTransforms',
          'hwp5DrawingComponents',
          'hwp5DrawingBodies',
          'currentParagraphFlows',
        ]
      : []),
  ];
  const rows = Object.fromEntries(names.map((name) => [name, content[name] ?? []]));
  if ((h5 && !isProjectionDataOnly(rows)) || names.some((name) => !Array.isArray(rows[name])))
    return noQuery;
  const owners = pair(rows.drawings, 'section', 'drawingNode');
  const paragraphs = pair(rows.paragraphs, 'section', 'paragraph');
  const textByOwner = new Map();
  for (const paragraph of rows.paragraphs) {
    const node = paragraph?.drawingText?.drawingNode;
    if (!uint(paragraph?.section) || !uint(node)) continue;
    const key = `${paragraph.section}:${node}`;
    const group = textByOwner.get(key);
    if (group) group.push(paragraph);
    else textByOwner.set(key, [paragraph]);
  }
  const roots = h5 ? pair(rows.hwp5Drawings, 'section', 'componentNode') : null;
  const controls = h5 ? pair(rows.hwp5Drawings, 'section', 'controlNode') : null;
  const locals = h5 ? pair(rows.hwp5DrawingLocalTransforms, 'section', 'component_node') : null;
  const components = h5 ? pair(rows.hwp5DrawingComponents, 'section', 'component_node') : null;
  const bodies = h5 ? pair(rows.hwp5DrawingBodies, 'section', 'ownerNode') : null;
  const flows = h5 ? pair(rows.currentParagraphFlows, 'section', 'paragraph') : null;
  // Preserve Native anchor order and batch boundary conversion once per host.
  // Mapping each owner through the full offset table would multiply owners by offsets.
  const anchorsByHost = new Map(),
    anchorCache = new Map();
  if (h5)
    for (const root of rows.hwp5Drawings) {
      const key = `${root.section}:${root.hostParagraph}`;
      const group = anchorsByHost.get(key);
      if (group) group.push(root);
      else anchorsByHost.set(key, [root]);
    }
  const anchorMatches = (root, host) => {
    const key = `${root.section}:${root.hostParagraph}`;
    if (!anchorCache.has(key)) {
      const matched = new Map();
      anchorCache.set(key, matched);
      try {
        sourceDisplayPosition(0, host.sourceOffsets, host.text.length);
        const group = anchorsByHost.get(key) ?? [],
          boundaries = [];
        let previous = -1;
        for (const item of group) {
          const unit = item.anchorUnit;
          if (
            !uint(unit) ||
            unit <= previous ||
            unit >= host.text.length ||
            host.text[unit] !== '\ufffc'
          )
            return false;
          previous = unit;
          boundaries.push(
            { startUnit: unit, endUnit: unit },
            { startUnit: unit + 1, endUnit: unit + 1 },
          );
        }
        const mapped = sourceTextChanges(boundaries, host.sourceOffsets);
        for (let index = 0; index < group.length; index++) {
          const start = mapped[index * 2].startUnit,
            end = mapped[index * 2 + 1].startUnit;
          matched.set(
            group[index].componentNode,
            start === group[index].anchor?.current_unit && end === start + 8,
          );
        }
      } catch {
        return false;
      }
    }
    return anchorCache.get(key).get(root.componentNode) === true;
  };
  // Current Native errors declare a physical section, not an inferred page/owner.
  // Unknown scope fails closed; an explicitly different section cannot reject this owner.
  const errorSections = new Map();
  const hasTargetErrors = (name, section) => {
    if (!errorSections.has(name)) {
      const errors = content[name],
        sections = new Set();
      let unknown = !Array.isArray(errors) || !isProjectionDataOnly(errors);
      if (!unknown)
        for (const error of errors) {
          if (!uint(error?.section)) unknown = true;
          else sections.add(error.section);
        }
      errorSections.set(name, { unknown, sections });
    }
    const scope = errorSections.get(name);
    return scope.unknown || scope.sections.has(section);
  };
  const cache = new Map();
  return {
    get(section, drawingNode) {
      if (!uint(section) || !uint(drawingNode)) return null;
      const key = `${section}:${drawingNode}`;
      if (cache.has(key)) return cache.get(key);
      cache.set(key, null);
      const row = unique(owners, section, drawingNode),
        source = row?.source;
      if (!row || !source || !uint(row.hostParagraph) || !uint(row.anchorUnit)) return null;
      let root = null,
        geometry = source.geometry;
      let activationSafe =
        source.transform_identity === true &&
        source.rendering?.angle === 0 &&
        source.group_context === null;
      if (!h5) {
        if (
          source.drawing_node !== drawingNode ||
          source.paragraph !== row.hostParagraph + 1 ||
          source.anchor_unit !== row.anchorUnit
        )
          return null;
      } else {
        root = unique(roots, section, drawingNode);
        const local = unique(locals, section, drawingNode),
          component = unique(components, section, drawingNode);
        const host = unique(paragraphs, section, row.hostParagraph),
          flow = unique(flows, section, row.hostParagraph);
        if (
          !root ||
          !local ||
          !component ||
          !host ||
          !flow ||
          !uint(row.controlNode) ||
          unique(controls, section, row.controlNode)?.componentNode !== drawingNode ||
          root.controlNode !== row.controlNode ||
          root.hostParagraph !== row.hostParagraph ||
          root.anchorUnit !== row.anchorUnit
        )
          return null;
        const raw = root.source,
          anchor = root.anchor;
        try {
          validateHwp5DrawingSources([raw]);
          validateHwp5DrawingAnchors([anchor]);
          geometry = hwp5DrawingGeometry(raw).geometry;
        } catch {
          return null;
        }
        if (
          raw.component_node !== drawingNode ||
          raw.control_node !== row.controlNode ||
          raw.kind_id !== 0x24726563 ||
          !anchor ||
          anchor.component_node !== drawingNode ||
          anchor.control_node !== row.controlNode ||
          anchor.paragraph !== row.hostParagraph ||
          !uint(anchor.current_unit) ||
          anchor.current_unit > 0xfffffff7 ||
          flow.source_node !== raw.paragraph_node ||
          flow.top_level !== true ||
          flow.host !== 'body' ||
          host.clipped === true ||
          typeof host.text !== 'string' ||
          local.owner_node !== row.controlNode ||
          component.owner_node !== row.controlNode
        )
          return null;
        if (!anchorMatches(root, host)) return null;
        // Native H5 local transforms/rotation and the painted projection are independent witnesses.
        // Missing rotations remain unknown; no HWPX address or transform flag is synthesized.
        activationSafe =
          source.group_context === null &&
          raw.rotation_angle === 0 &&
          component.rotation_angle === 0 &&
          component.group_count === 0 &&
          component.kind_id === raw.kind_id &&
          component.attributes === raw.component_attributes &&
          (raw.component_attributes & 3) === 0 &&
          source.rendering?.unknown_component_attributes ===
            (raw.component_attributes & ~3) >>> 0 &&
          component.offset_x === raw.component_offset_x &&
          component.offset_y === raw.component_offset_y &&
          component.current_width === raw.current_width &&
          component.current_height === raw.current_height &&
          component.original_width === raw.original_width &&
          component.original_height === raw.original_height &&
          identity(local.matrix) &&
          identity(source.rendering?.matrix) &&
          source.rendering?.angle === 0 &&
          drawingAxisGeometry(source) &&
          raw.component_offset_x === 0 &&
          raw.component_offset_y === 0 &&
          raw.current_width === raw.width &&
          raw.current_height === raw.height &&
          raw.original_width === raw.width &&
          raw.original_height === raw.height &&
          source.geometry?.width === raw.width &&
          source.geometry?.height === raw.height;
        for (const name of [
          'hwp5DrawingErrors',
          'hwp5DrawingComponentErrors',
          'hwp5DrawingLocalErrors',
          'hwp5DrawingGeometryErrors',
          'hwp5DrawingMatrixErrors',
          'hwp5DrawingCornerErrors',
        ])
          if (hasTargetErrors(name, section)) activationSafe = false;
        if (!activationSafe) return null;
      }
      const measured =
        geometry && typeof geometry === 'object' && !Array.isArray(geometry)
          ? Object.freeze({
              width: geometry.width,
              height: geometry.height,
              width_relative: geometry.width_relative,
              height_relative: geometry.height_relative,
              treat_as_character: geometry.treat_as_character,
            })
          : null;
      const observation = Object.freeze({
        row,
        geometry: measured,
        activationSafe,
        readText() {
          const owned = textByOwner.get(key) ?? [];
          const textOwner = source.text;
          if (!owned.length && !h5) return textOwner == null ? emptyText : noText;
          let body = null;
          if (h5) {
            // Check observation completeness before treating absence as an empty rectangle.
            if (
              hasTargetErrors('hwp5DrawingBodyErrors', section) ||
              !Array.isArray(content.hwp5DrawingBodies)
            )
              return noText;
            const hit = bodies.find(section, drawingNode);
            if (!owned.length && hit.count === 0) return textOwner == null ? emptyText : noText;
            body = hit.count === 1 ? hit.first : null;
            if (
              !body ||
              body.kind !== 'body' ||
              body.controlNode !== root.controlNode ||
              body.ownerNode !== drawingNode ||
              !Array.isArray(body.paragraphs) ||
              body.paragraphs.length !== owned.length ||
              body.source?.paragraph_count !== owned.length
            )
              return noText;
            try {
              validateHwp5DrawingListSources([body.source]);
            } catch {
              return noText;
            }
            if (
              body.source.kind !== 'body' ||
              body.source.control_node !== body.controlNode ||
              body.source.owner_node !== body.ownerNode ||
              body.source.list_node !== body.listNode ||
              textOwner?.list_node !== body.listNode
            )
              return noText;
          } else if (!textOwner || !uint(textOwner.list_node) || !uint(textOwner.node))
            return noText;
          let previous = -1;
          const textRows = [];
          for (let index = 0; index < owned.length; index++) {
            const paragraph = owned[index];
            const text = paragraph.text;
            if (
              !uint(paragraph.paragraph) ||
              paragraph.paragraph <= previous ||
              (h5 && unique(paragraphs, section, paragraph.paragraph) === null) ||
              typeof text !== 'string' ||
              paragraph.clipped === true ||
              paragraph.tableCell ||
              paragraph.tableCaption ||
              paragraph.drawingCaption
            )
              return noText;
            previous = paragraph.paragraph;
            if (h5) {
              const flow = unique(flows, section, paragraph.paragraph);
              if (
                body.paragraphs[index] !== paragraph.paragraph ||
                paragraph.drawingText.listNode !== body.listNode ||
                !flow ||
                !uint(flow.source_node) ||
                flow.host !== 'drawing' ||
                flow.top_level !== false ||
                flow.parent_node !== drawingNode ||
                flow.list_node !== body.listNode
              )
                return noText;
            } else if (
              paragraph.drawingText.listNode !== textOwner.list_node ||
              paragraph.drawingText.textNode !== textOwner.node
            )
              return noText;
            textRows.push(Object.freeze({ paragraph: paragraph.paragraph, text }));
          }
          return Object.freeze({ state: 'available', paragraphs: Object.freeze(textRows) });
        },
      });
      cache.set(key, observation);
      return observation;
    },
  };
}
