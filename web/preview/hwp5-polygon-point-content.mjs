import { validateHwp5DrawingPolygonPoints } from '../../js/hwp5-drawing-polygon-points.mjs';
import { attachHwp5ShapePoints } from './hwp5-shape-point-content.mjs';

// Native owns framing/transforms. Worker only binds a complete section inventory.
export function attachHwp5PolygonPoints(editor, content) {
  return attachHwp5ShapePoints(editor, content, {
    kind: 0x24706f6c,
    rows: 'hwp5PolygonPoints',
    errors: 'hwp5PolygonPointErrors',
    validate: validateHwp5DrawingPolygonPoints,
    read: (e, section, layout) => e.drawingPolygonPoints(section, layout),
    incomplete: 'IncompleteHwp5PolygonSources',
    inventory: 'Hwp5PolygonInventoryMismatch',
    owner: 'Hwp5PolygonTransformOwnerMismatch',
  });
}
