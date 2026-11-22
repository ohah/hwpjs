import { ownObjectGeometryRecord } from './object-geometry-edit.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const invalid = () => {
  throw Error('InvalidPictureCrop');
};
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
export function checkedPictureCropSelector(input) {
  const p = ownObjectGeometryRecord(input, ['section', 'pictureNode']);
  if (!uint(p.section) || !uint(p.pictureNode)) invalid();
  return Object.freeze(p);
}
export function checkedPictureCropRect(input, bounds) {
  const p = ownObjectGeometryRecord(input, ['left', 'top', 'right', 'bottom']);
  if (
    !Object.values(p).every(uint) ||
    p.left >= p.right ||
    p.top >= p.bottom ||
    (bounds && (p.right > bounds.width || p.bottom > bounds.height))
  )
    invalid();
  return Object.freeze(p);
}
export function checkedPictureCropLease(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(value) ||
    (value.length === 20 && value > '18446744073709551615')
  )
    invalid();
  return value;
}
export function checkedPictureCropCapture(input) {
  const p = ownObjectGeometryRecord(input, [
    'profileVersion',
    'format',
    'section',
    'pictureNode',
    'leaseKey',
    'crop',
    'bounds',
    'historyRevision',
  ]);
  if (p.profileVersion !== 1 || !['hwp5', 'hwpx'].includes(p.format) || !uint(p.historyRevision))
    invalid();
  const bounds = ownObjectGeometryRecord(p.bounds, ['width', 'height', 'basis']);
  if (
    !uint(bounds.width) ||
    !bounds.width ||
    !uint(bounds.height) ||
    !bounds.height ||
    !['explicit_pair', 'absent_75_policy'].includes(bounds.basis)
  )
    invalid();
  if (p.format === 'hwp5' && (bounds.width > 2147483647 || bounds.height > 2147483647)) invalid();
  // Observation preserves signed raw edges; only requested rectangles require containment.
  const crop = ownObjectGeometryRecord(p.crop, ['left', 'top', 'right', 'bottom']);
  if (
    !Object.values(crop).every(
      (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 0xffffffff,
    )
  )
    invalid();
  return Object.freeze({
    ...checkedPictureCropSelector({ section: p.section, pictureNode: p.pictureNode }),
    profileVersion: 1,
    format: p.format,
    leaseKey: checkedPictureCropLease(p.leaseKey),
    crop: Object.freeze(crop),
    bounds: Object.freeze(bounds),
    historyRevision: p.historyRevision,
  });
}
export function pictureCropObservation(input) {
  const { leaseKey: _privateLease, ...observation } = checkedPictureCropCapture(input);
  return Object.freeze(observation);
}
export const PICTURE_CROP_EDIT_EXPORTS = Object.freeze(['version', 'capture', 'commit', 'release']);
/** Optional ABI, separate from the existing read-only HPC1 query. */
export function createPictureCropEditApi({ wasm, memory, check, prefix }) {
  if (!['hwp5_edit', 'hwpx_edit'].includes(prefix)) invalid();
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  const entry = (name) => `${prefix}_picture_crop_edit_${name}`;
  let retained;
  const supported = () =>
    PICTURE_CROP_EDIT_EXPORTS.every((name) => typeof wasm[entry(name)] === 'function') &&
    wasm[entry('version')]() === 1;
  const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
  return {
    supportsPictureCropEdit() {
      check();
      return supported();
    },
    capturePictureCrop(selector) {
      check();
      const selected = checkedPictureCropSelector(selector);
      if (!supported()) throw Error('PictureCropUnavailable');
      let result, cleanupKey, primary;
      try {
        retained = undefined;
        if (wasm[entry('capture')](selected.section, selected.pictureNode) !== 1)
          throw memory.error();
        const len = wasm[`${prefix}_output_len`]();
        if (!Number.isSafeInteger(len) || len < 1 || len > 4096) invalid();
        const decoded = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            memory.copy(wasm[`${prefix}_output_ptr`](), len),
          ),
        );
        try {
          cleanupKey = checkedPictureCropLease(
            Object.getOwnPropertyDescriptor(decoded ?? {}, 'leaseKey')?.value,
          );
        } catch {
          /* Never guess a Native lease key. */
        }
        result = checkedPictureCropCapture(decoded);
        if (
          result.format !== format ||
          result.section !== selected.section ||
          result.pictureNode !== selected.pictureNode
        )
          throw Error('PictureCropOwnerMismatch');
      } catch (error) {
        primary = error;
      } finally {
        try {
          wasm[`${prefix}_output_free`]();
        } catch (error) {
          if (primary && typeof primary === 'object') primary.cropOutputFreeError = String(error);
          else primary = error;
        }
      }
      if (primary) {
        if (cleanupKey) {
          try {
            memory.withBytes(encode({ leaseKey: cleanupKey }), (ptr, len) => {
              if (wasm[entry('release')](ptr, len) !== 1) throw memory.error();
            });
          } catch (error) {
            if (typeof primary === 'object') primary.cropReleaseError = String(error);
          }
        }
        throw primary;
      }
      retained = result;
      return result;
    },
    commitPictureCrop(input) {
      check();
      const p = ownObjectGeometryRecord(input, ['leaseKey', 'crop']);
      const key = checkedPictureCropLease(p.leaseKey);
      if (!supported()) throw Error('PictureCropUnavailable');
      if (!retained || retained.leaseKey !== key) throw Error('StalePictureCrop');
      const crop = checkedPictureCropRect(p.crop, retained.bounds);
      return applyNativeEdit(
        memory,
        encode({ leaseKey: key, crop }),
        (ptr, len) => {
          // Input allocation completed. Native consumes the exact matching lease on invocation.
          retained = undefined;
          return wasm[entry('commit')](ptr, len);
        },
        'InvalidPictureCropOutcome',
      );
    },
    releasePictureCrop(leaseKey) {
      check();
      const key = checkedPictureCropLease(leaseKey);
      if (!supported()) throw Error('PictureCropUnavailable');
      return memory.withBytes(encode({ leaseKey: key }), (ptr, len) => {
        if (retained?.leaseKey === key) retained = undefined;
        const code = wasm[entry('release')](ptr, len);
        if (code !== 1) throw memory.error();
        return true;
      });
    },
  };
}
