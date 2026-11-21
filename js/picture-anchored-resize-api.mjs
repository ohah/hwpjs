import { PICTURE_ANCHORED_RESIZE_ABI } from './abi-schema.mjs';
import {
  checkedPictureResizeBefore,
  checkedPictureResizeRequest,
  checkedPictureResizeSelector,
} from './picture-anchored-resize-transport.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const invalid = () => {
  throw Error('InvalidAnchoredPictureResize');
};

export function createPictureAnchoredResizeApi({ wasm, memory, check, prefix }) {
  if (prefix !== 'hwp5_edit' && prefix !== 'hwpx_edit') return invalid();
  const format = prefix === 'hwp5_edit' ? 'hwp5' : 'hwpx';
  const entry = (name) => `${prefix}_picture_resize_anchor_${name}`;
  const [version, query, set] = ['version', 'query', 'set'].map(entry);
  const names = Object.keys(PICTURE_ANCHORED_RESIZE_ABI).filter((name) =>
    name.startsWith(prefix + '_'),
  );
  let retained;
  const supported = () =>
    names.every((name) => typeof wasm[name] === 'function') && wasm[version]() === 1;
  return {
    supportsPictureAnchoredResize() {
      check();
      return supported();
    },
    pictureAnchoredResize(section, pictureNode) {
      check();
      retained = undefined;
      checkedPictureResizeSelector({ section, pictureNode });
      if (!supported()) throw Error('AnchoredPictureResizeUnavailable');
      let native;
      try {
        if (wasm[query](section, pictureNode) !== 1) throw memory.error();
        const len = wasm[`${prefix}_output_len`]();
        if (!Number.isSafeInteger(len) || len < 1 || len > 16384) return invalid();
        native = checkedPictureResizeBefore(
          JSON.parse(decoder.decode(memory.copy(wasm[`${prefix}_output_ptr`](), len))),
          format,
        );
      } finally {
        wasm[`${prefix}_output_free`]();
      }
      const owner = format === 'hwp5' ? native : native.expected;
      if (owner.section !== section || owner.pictureNode !== pictureNode)
        throw Error('AnchoredPictureOwnerMismatch');
      retained = native;
      return native;
    },
    setPictureAnchoredResize(input) {
      check();
      const { before, width, height, anchor } = checkedPictureResizeRequest(input, format);
      if (!supported()) throw Error('AnchoredPictureResizeUnavailable');
      if (!retained || JSON.stringify(before) !== JSON.stringify(retained))
        throw Error('StaleAnchoredPictureResize');
      retained = undefined;
      const request =
        format === 'hwp5'
          ? { lease: before.lease, width, height, anchor }
          : {
              profileVersion: 1,
              section: before.expected.section,
              pictureNode: before.expected.pictureNode,
              expected: before.expected,
              binding: before.binding,
              width,
              height,
              anchor,
            };
      return applyNativeEdit(
        memory,
        encoder.encode(JSON.stringify(request)),
        (ptr, len) => wasm[set](ptr, len),
        'InvalidAnchoredPictureResizeOutcome',
      );
    },
  };
}
