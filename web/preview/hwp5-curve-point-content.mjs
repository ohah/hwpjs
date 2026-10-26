import { validateHwp5DrawingCurvePoints } from '../../js/hwp5-drawing-curve-points.mjs';
import { attachHwp5ShapePoints } from './hwp5-shape-point-content.mjs';
export function attachHwp5CurvePoints(editor, content) {
  return attachHwp5ShapePoints(editor, content, {
    kind: 0x24637572,
    rows: 'hwp5CurvePoints',
    errors: 'hwp5CurvePointErrors',
    validate: validateHwp5DrawingCurvePoints,
    read: (e, section, layout) => e.drawingCurvePoints(section, layout),
    incomplete: 'IncompleteHwp5CurveSources',
    inventory: 'Hwp5CurveInventoryMismatch',
    owner: 'Hwp5CurveTransformOwnerMismatch',
  });
}
