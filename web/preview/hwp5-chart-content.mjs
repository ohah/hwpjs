import { hwp5DrawingGeometry } from './hwp5-drawing-geometry.mjs';
import { affinePoint, hwpRenderingMatrix } from './affine-point-geometry.mjs';
import { drawingAxisGeometry } from './drawing-axis-geometry.mjs';
import { validateHwp5DrawingLocalTransforms } from '../../js/hwp5-drawing-local-transforms.mjs';
import { hwp5ChartAnchorIndex } from './hwp5-chart-anchor.mjs';

const key = (section, node) => `${section}:${node}`;
function uniqueIndex(rows, identity) {
  const result = new Map();
  for (const row of rows ?? []) {
    const id = identity(row);
    result.set(id, result.has(id) ? null : row);
  }
  return result;
}
export function hwp5ChartFrame(owner, local, resource = null) {
  const source = owner.geometry;
  // spec24 has no observed26 kind field; accept only the known content-aspect profile.
  const spec24 =
    owner.ole_layout === 'spec24' && owner.attributes === 1 && resource?.state === 'modern_chart';
  if (
    !spec24 &&
    (owner.ole_layout !== 'observed26' ||
      (owner.attributes & 255) !== 1 ||
      (owner.attributes & 0x100) !== 0 ||
      ![0, 1].includes((owner.attributes >>> 16) & 63) ||
      (((owner.attributes >>> 16) & 63) === 0 && resource?.state !== 'modern_chart'))
  )
    throw Error('UnsupportedHwp5ChartOleAspect');
  if (
    !local ||
    local.component_node !== owner.component_node ||
    local.owner_node !== owner.control_node
  )
    throw Error('MissingHwp5ChartTransform');
  validateHwp5DrawingLocalTransforms([local]);
  // Component-local coordinates and the declared document frame are different spaces.
  // Check the Native matrix against Native original/current dimensions; never infer a missing matrix.
  const sizes = [
    source.original_width,
    source.original_height,
    source.current_width,
    source.current_height,
  ];
  if (
    !sizes.every((value) => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff) ||
    source.component_extra_bytes !== 0 ||
    source.component_offset_x !== 0 ||
    source.component_offset_y !== 0
  )
    throw Error('UnsupportedHwp5ChartTransform');
  const canvas = hwpRenderingMatrix(local.matrix);
  const corners = [
    [0, 0],
    [source.original_width, 0],
    [source.original_width, source.original_height],
    [0, source.original_height],
  ].map((point) => affinePoint(canvas, point));
  const rendering = {
    matrix: local.matrix,
    angle: source.rotation_angle,
    flip: [!!(source.component_attributes & 1), !!(source.component_attributes & 2)],
    reverse: null,
    unknown_component_attributes: (source.component_attributes & ~3) >>> 0,
  };
  if (
    !drawingAxisGeometry({
      rendering,
      rendering_corners: corners,
      geometry: { width: source.current_width, height: source.current_height },
    })
  )
    throw Error('UnsupportedHwp5ChartTransform');
  // The common object owns final placement and size. Do not multiply its dimensions by local scale again.
  const frame = hwp5DrawingGeometry(source);
  if (
    frame.geometry.width_relative !== 4 ||
    frame.geometry.height_relative !== 2 ||
    ![frame.geometry.width, frame.geometry.height].every(
      (number) => Number.isInteger(number) && number > 0,
    )
  )
    throw Error('UnsupportedHwp5ChartSize');
  return frame;
}
/** Native observation to display metadata only. Never constructs an edit/geometry target. */
export function projectHwp5ChartContent(content, packet) {
  const paragraphs = uniqueIndex(content.paragraphs, (row) => key(row.section, row.paragraph));
  const locals = uniqueIndex(content.hwp5DrawingLocalTransforms, (row) =>
    key(row.section, row.component_node),
  );
  const anchors = new Map(),
    targets = [],
    unresolved = [];
  for (const candidate of packet.candidates) {
    if (candidate.resource.state !== 'modern_chart') {
      unresolved.push(candidate);
      continue;
    }
    const owner = candidate.owner;
    const target = {
      kind: 'hwp5-chart',
      format: 'hwp5',
      section: candidate.section,
      controlNode: owner.control_node,
      componentNode: owner.component_node,
      oleNode: owner.ole_node,
      paragraph: owner.paragraph,
      physicalParagraphNode: owner.paragraph_node,
      owner,
      resource: candidate.resource,
      sourceEpoch: packet.source_epoch,
      historyRevision: packet.history_revision,
    };
    try {
      const id = key(target.section, target.paragraph),
        row = paragraphs.get(id);
      if (
        !row ||
        row.clipped ||
        row.tableCell ||
        row.createdCell ||
        row.drawingText ||
        row.drawingCaption ||
        row.selectionOwner !== `section:${target.section}:body`
      )
        throw Error('UnsupportedHwp5ChartPreviewOwner');
      if (!anchors.has(id)) anchors.set(id, hwp5ChartAnchorIndex(row));
      const unit = anchors.get(id).get(owner.current_unit);
      if (!Number.isInteger(unit) || row.text[unit] !== '\ufffc')
        throw Error('MissingHwp5ChartDisplayAnchor');
      target.anchorUnit = unit;
      target.frame = hwp5ChartFrame(
        owner,
        locals.get(key(target.section, target.componentNode)),
        candidate.resource,
      );
    } catch (error) {
      target.error_name = error?.message || String(error);
    }
    targets.push(target);
  }
  return {
    ...content,
    hwp5ChartDisplayAvailable: true,
    hwp5ChartTargets: targets,
    hwp5ChartUnresolved: unresolved,
    hwp5ChartSourceEpoch: packet.source_epoch,
    hwp5ChartHistoryRevision: packet.history_revision,
  };
}
export function attachHwp5Charts(editor, content) {
  const empty = {
    ...content,
    hwp5ChartDisplayAvailable: false,
    hwp5ChartTargets: [],
    hwp5ChartUnresolved: [],
  };
  if (editor?.supportsHwp5ChartDisplayAbi?.() !== true) return empty;
  try {
    return projectHwp5ChartContent(content, editor.hwp5ChartCandidates());
  } catch (error) {
    return { ...empty, hwp5ChartQueryError: error?.message || String(error) };
  }
}
