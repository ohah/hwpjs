import { ownObjectGeometryRecord as record } from './object-geometry-edit.mjs';
export const PICTURE_RESIZE_ANCHORS = Object.freeze([
  'top_left',
  'top_center',
  'top_right',
  'center_left',
  'center_right',
  'bottom_left',
  'bottom_center',
  'bottom_right',
]);
const anchors = new Set(PICTURE_RESIZE_ANCHORS);
const uint = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 0xffffffff && !Object.is(value, -0);
const size = (value) => uint(value) && value > 0;
const signed = (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
const decimal = (value) =>
  typeof value === 'string' &&
  /^(?:0|[1-9][0-9]{0,19})$/.test(value) &&
  BigInt(value) <= 0xffffffffffffffffn;
const invalid = () => {
  throw Error('InvalidAnchoredPictureResize');
};

function vector(input, length, valid) {
  if (!Array.isArray(input)) return invalid();
  const desc = Object.getOwnPropertyDescriptors(input);
  if (desc.length?.value !== length || Reflect.ownKeys(desc).length !== length + 1)
    return invalid();
  const out = [];
  for (let i = 0; i < length; i++) {
    const cell = desc[i];
    if (!cell || !Object.hasOwn(cell, 'value') || !valid(cell.value)) return invalid();
    out.push(cell.value);
  }
  return Object.freeze(out);
}

function h5Observation(input) {
  const o = record(input, [
    'profileVersion',
    'format',
    'section',
    'pictureNode',
    'width',
    'height',
    'horizontalOffset',
    'verticalOffset',
    'historyRevision',
    'lease',
  ]);
  if (
    o.profileVersion !== 1 ||
    o.format !== 'hwp5' ||
    ![o.section, o.pictureNode, o.historyRevision].every(uint) ||
    ![o.width, o.height].every(size) ||
    ![o.horizontalOffset, o.verticalOffset].every(signed) ||
    !decimal(o.lease) ||
    o.lease === '0'
  )
    return invalid();
  return Object.freeze({
    profileVersion: 1,
    format: 'hwp5',
    section: o.section,
    pictureNode: o.pictureNode,
    width: o.width,
    height: o.height,
    horizontalOffset: o.horizontalOffset,
    verticalOffset: o.verticalOffset,
    historyRevision: o.historyRevision,
    lease: o.lease,
  });
}

function hxObservation(input) {
  const o = record(input, ['profileVersion', 'expected', 'binding']);
  const e = record(o.expected, [
    'section',
    'pictureNode',
    'size',
    'offsets',
    'sourceSha256',
    'serial',
  ]);
  const b = record(o.binding, ['session', 'revision']);
  if (
    o.profileVersion !== 1 ||
    ![e.section, e.pictureNode, b.revision].every(uint) ||
    !decimal(e.serial) ||
    typeof b.session !== 'string' ||
    !b.session.length ||
    b.session.length > 256
  )
    return invalid();
  return Object.freeze({
    profileVersion: 1,
    expected: Object.freeze({
      section: e.section,
      pictureNode: e.pictureNode,
      size: vector(e.size, 2, size),
      offsets: vector(e.offsets, 2, signed),
      sourceSha256: vector(e.sourceSha256, 32, (byte) => uint(byte) && byte <= 255),
      serial: e.serial,
    }),
    binding: Object.freeze({ session: b.session, revision: b.revision }),
  });
}

export function checkedPictureResizeSelector(input) {
  const s = record(input, ['section', 'pictureNode']);
  if (!uint(s.section) || !uint(s.pictureNode)) return invalid();
  return Object.freeze(s);
}
export function checkedPictureResizeDimensions(input) {
  const p = record(input, ['width', 'height', 'anchor']);
  if (!size(p.width) || !size(p.height) || !anchors.has(p.anchor)) return invalid();
  return Object.freeze(p);
}
export function checkedPictureResizeBefore(input, format) {
  if (format === 'hwp5') return h5Observation(input);
  if (format === 'hwpx') return hxObservation(input);
  return invalid();
}
export function pictureResizeObservation(before, format) {
  const n = checkedPictureResizeBefore(before, format);
  const e = format === 'hwp5' ? n : n.expected;
  return Object.freeze({
    profileVersion: 1,
    format,
    section: e.section,
    pictureNode: e.pictureNode,
    width: format === 'hwp5' ? n.width : e.size[0],
    height: format === 'hwp5' ? n.height : e.size[1],
    horizontalOffset: format === 'hwp5' ? n.horizontalOffset : e.offsets[0],
    verticalOffset: format === 'hwp5' ? n.verticalOffset : e.offsets[1],
    historyRevision: format === 'hwp5' ? n.historyRevision : n.binding.revision,
  });
}
export function checkedPictureResizeRequest(input, format) {
  const p = record(input, ['before', 'width', 'height', 'anchor']);
  const dimensions = checkedPictureResizeDimensions({
    width: p.width,
    height: p.height,
    anchor: p.anchor,
  });
  return Object.freeze({ before: checkedPictureResizeBefore(p.before, format), ...dimensions });
}
