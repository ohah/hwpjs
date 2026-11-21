import { inlineInsertRecord } from './hwpx-inline-object-record.mjs';
import { checkedInlineObjectTarget } from './hwpx-inline-object-placement.mjs';
import { copyPictureInput } from './picture-replacement-input.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const encoder = new TextEncoder();
export function checkedImageInsertOptions(input) {
  const p = inlineInsertRecord(input, ['imageBytes', 'width', 'height']);
  for (const key of ['width', 'height'])
    if (!Number.isSafeInteger(p[key]) || p[key] <= 0 || p[key] > 0x7fffffff)
      throw Error('InvalidPictureInsertionSize');
  return {
    imageBytes: copyPictureInput(p.imageBytes, 8 * 1024 * 1024, 'Image'),
    width: p.width,
    height: p.height,
  };
}
// Additional buffers must not erase an observed commit when cleanup throws.
function invoke(memory, metadata, image, reference, action) {
  let outcome;
  const call = (rp, rn) =>
    memory.withBytes(image, (ip, n) => {
      outcome = applyNativeEdit(
        memory,
        encoder.encode(JSON.stringify(metadata)),
        (p, size) => action(rp, rn, p, size, ip, n),
        'InvalidImageInsertResult',
      );
      return outcome;
    });
  try {
    return reference ? memory.withBytes(reference, call) : call(0, 0);
  } catch (error) {
    if (!outcome) throw error;
    return { ...outcome, cleanupError: error?.message || String(error), refreshRequired: true };
  }
}
export function createLiveImageInsertApi({ wasm, memory, check, encode }) {
  const h5 = typeof encode === 'function';
  const name = h5 ? 'hwp5_edit_insert_image_current' : 'hwpx_edit_insert_image';
  const version = h5 ? 'hwp5_edit_image_insert_version' : 'hwpx_edit_image_insert_version';
  const supported = () => {
    check();
    return (
      typeof wasm[version] === 'function' &&
      wasm[version].length === 0 &&
      typeof wasm[name] === 'function' &&
      wasm[name].length === (h5 ? 6 : 4) &&
      wasm[version]() === 1
    );
  };
  return {
    supportsImageInsertionAbi: supported,
    insertImage(input) {
      check();
      if (!supported()) throw Error('ImageInsertionUnavailable');
      const p = inlineInsertRecord(
        input,
        h5
          ? ['reference', 'start', 'imageBytes', 'width', 'height']
          : ['target', 'imageBytes', 'width', 'height'],
      );
      const { imageBytes, width, height } = checkedImageInsertOptions({
        imageBytes: p.imageBytes,
        width: p.width,
        height: p.height,
      });
      if (h5) {
        const ref = encode(p.reference).slice();
        if (!['original', 'generated'].includes(p.reference.kind))
          throw Error('UnsupportedPictureInsertionHost');
        if (
          !Number.isSafeInteger(p.start) ||
          p.start < 0 ||
          Object.is(p.start, -0) ||
          p.start > 0xffffffff
        )
          throw Error('InvalidImageInsertUnit');
        return invoke(
          memory,
          { start: p.start, width, height },
          imageBytes,
          ref,
          (rp, rn, ptr, size, ip, n) => wasm[name](rp, rn, ptr, size, ip, n),
        );
      }
      const target = checkedInlineObjectTarget(p.target);
      if (target.owner?.kind !== 'body') throw Error('UnsupportedPictureInsertionHost');
      return invoke(
        memory,
        { target, width, height },
        imageBytes,
        null,
        (_rp, _rn, ptr, size, ip, n) => wasm[name](ptr, size, ip, n),
      );
    },
  };
}
