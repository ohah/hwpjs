import { validateHwp5PictureShadowSource } from '../../js/hwp5-picture-shadow-source.mjs';
import { pictureShadowBounds } from './picture-shadow-bounds.mjs';
import { pictureShadowRasterSize } from './picture-shadow-raster-budget.mjs';

export function hwp5PictureShadowPlan(picture) {
  const tail = picture?.tailSource;
  if (!tail || tail.effects_flags === 0) return { state: 'none' };
  const fail = () => ({ state: 'unavailable', error: 'UnsupportedHwp5PictureShadow' });
  if (tail.effects_flags !== 1 || !tail.shadow) return fail();
  try {
    validateHwp5PictureShadowSource(tail.shadow, tail.effects_flags);
  } catch {
    return fail();
  }
  const shadow = tail.shadow,
    p = shadow.properties;
  const bits = new DataView(new ArrayBuffer(4));
  const float = (value) => {
    bits.setUint32(0, value, true);
    return bits.getFloat32(0, true);
  };
  const alpha = float(p.transparency_bits),
    blur = float(p.blur_bits),
    direction = float(p.direction_bits),
    distance = float(p.distance_bits);
  if (
    p.style !== 0 ||
    p.alignment !== 0 ||
    p.rotate_with_shape !== 0 ||
    float(p.skew_x_bits) !== 0 ||
    float(p.skew_y_bits) !== 0 ||
    float(p.scale_x_bits) !== 1 ||
    float(p.scale_y_bits) !== 1 ||
    shadow.color_type !== 0 ||
    shadow.color_effect_count !== 0 ||
    shadow.color_value > 0xffffff ||
    ![alpha, blur, direction, distance].every(Number.isFinite) ||
    alpha < 0 ||
    alpha > 1 ||
    blur < 0 ||
    distance < 0 ||
    direction < 0 ||
    direction > 360 ||
    picture.transform?.angle !== 0 ||
    !Array.isArray(picture.transform?.flip) ||
    picture.transform.flip.length !== 2 ||
    !Array.from(picture.transform.flip).every((value) => value === false)
  )
    return fail();
  const points = picture.source?.points;
  if (
    !Array.isArray(points) ||
    points.length !== 4 ||
    !Array.from(points).every(
      (point) =>
        Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite),
    )
  )
    return fail();
  const [[x, y], [right, top], [farRight, bottom], [left, farBottom]] = points;
  if (
    x !== 0 ||
    y !== 0 ||
    top !== 0 ||
    left !== 0 ||
    right <= 0 ||
    bottom <= 0 ||
    farRight !== right ||
    farBottom !== bottom
  )
    return fail();
  const corners = picture.renderingCorners;
  if (
    corners !== undefined &&
    (!Array.isArray(corners) ||
      corners.length !== 4 ||
      !Array.from(corners).every(
        (point) =>
          Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite),
      ) ||
      corners[0][1] !== corners[1][1] ||
      corners[1][0] !== corners[2][0] ||
      corners[2][1] !== corners[3][1] ||
      corners[3][0] !== corners[0][0] ||
      corners[1][0] <= corners[0][0] ||
      corners[3][1] <= corners[0][1])
  )
    return fail();
  const radians = (direction * Math.PI) / 180;
  const plan = {
    state: 'outer',
    opacity: 1 - alpha,
    blur: blur / 75,
    offsetX: (Math.cos(radians) * distance) / 75,
    offsetY: (Math.sin(radians) * distance) / 75,
    color: shadow.color_value,
    width: right / 75,
    height: bottom / 75,
    rasterParity: 'unverified',
  };
  if (
    !pictureShadowRasterSize(
      pictureShadowBounds(plan, Math.max(0, (picture.source.border_width ?? 0) / 75)),
      1,
    )
  )
    return fail();
  return plan;
}
