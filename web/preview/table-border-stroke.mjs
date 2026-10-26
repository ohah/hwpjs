const mm = (value) => (value * 96) / 25.4;

// Measured from the legacy noori.html fixture SVG, not a Hancom rendering oracle:
// nominal 0.5 mm DOUBLE_SLIM -> two 0.12 mm strokes, centers 0.37 mm
// apart, endpoints extended 0.06 mm. SVG coordinates have 0.01 mm precision;
// the symmetric +/-0.185 centers differ from its rounded paths by <=0.005 mm.
// Other nominal widths have no measured profile and stay unsupported.
export function tableBorderStrokeParts(stroke) {
  if (!Number.isFinite(stroke?.width) || stroke.width <= 0) return null;
  if (stroke.compound === undefined) return [{ width: stroke.width, offset: 0, extension: 0 }];
  if (stroke.compound !== 'DOUBLE_SLIM' || stroke.width !== mm(0.5)) return null;
  return [-1, 1].map((sign) => ({
    width: mm(0.12),
    offset: sign * mm(0.185),
    extension: mm(0.06),
  }));
}
