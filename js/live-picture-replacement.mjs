import { ownObjectGeometryRecord } from './object-geometry-edit.mjs';
import { copyPictureInput } from './picture-replacement-input.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const maxImageBytes = 8 * 1024 * 1024;
const uint = (value) =>
  Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;
const invalid = () => {
  throw Error('InvalidPictureReplacementOwner');
};
const boundedString = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    !value.isWellFormed() ||
    encoder.encode(value).length > 4096
  )
    invalid();
  return value;
};
function digest(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== 32
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== 33) invalid();
  const bytes = [];
  for (let index = 0; index < 32; index++) {
    const entry = descriptors[index];
    if (!entry || !Object.hasOwn(entry, 'value') || !uint(entry.value) || entry.value > 255)
      invalid();
    bytes.push(entry.value);
  }
  return Object.freeze(bytes);
}

export function checkedPictureReplacementSelector(value) {
  const p = ownObjectGeometryRecord(value, ['section', 'pictureNode']);
  if (!uint(p.section) || !uint(p.pictureNode)) throw Error('InvalidPictureReplacementSelector');
  return Object.freeze(p);
}

export function checkedPictureReplacementOwner(value) {
  const p = ownObjectGeometryRecord(value, [
    'format',
    'section',
    'pictureNode',
    'pictureIdentity',
    'sourceSha256',
    'resourceSha256',
    'resourceLink',
    'historyRevision',
    'binding',
  ]);
  if (
    !['hwp5', 'hwpx'].includes(p.format) ||
    ![p.section, p.pictureNode, p.historyRevision].every(uint)
  )
    invalid();
  const binding = ownObjectGeometryRecord(p.binding, ['session', 'serial']);
  if (
    typeof binding.session !== 'string' ||
    !/^[\x20-\x7e]{1,512}$/.test(binding.session) ||
    typeof binding.serial !== 'string' ||
    !/^(0|[1-9][0-9]{0,19})$/.test(binding.serial) ||
    (binding.serial.length === 20 && binding.serial > '18446744073709551615')
  )
    invalid();
  return Object.freeze({
    ...p,
    pictureIdentity: boundedString(p.pictureIdentity),
    resourceLink: boundedString(p.resourceLink),
    sourceSha256: digest(p.sourceSha256),
    resourceSha256: digest(p.resourceSha256),
    binding: Object.freeze(binding),
  });
}

export function copyPictureReplacementImage(bytes) {
  return copyPictureInput(bytes, maxImageBytes, 'Image');
}

/** The caller owns the live editor instance; no file transform or reopening. */
export function createLivePictureReplacementApi({ format, wasm, memory, check, output }) {
  if (!['hwp5', 'hwpx'].includes(format)) throw Error('InvalidPictureReplacementFormat');
  // Independent package chunks must never reuse a counter-derived owner scope.
  // Missing secure randomness disables this optional API, not the live editor.
  let scope;
  try {
    const nonce = globalThis.crypto?.randomUUID?.();
    if (
      typeof nonce === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)
    )
      scope = 'picture-replacement-' + nonce + ':';
  } catch {
    /* Optional replacement remains unavailable. */
  }
  const prefix = format === 'hwp5' ? 'hwp5_edit_' : 'hwpx_edit_';
  const version = prefix + 'picture_replace_version';
  const ownerQuery = prefix + 'picture_replace_owner';
  const replace = prefix + 'replace_picture';
  function supportsPictureReplacement() {
    check();
    return (
      typeof scope === 'string' &&
      [version, ownerQuery, replace].every((name) => typeof wasm[name] === 'function') &&
      wasm[version]() === 1
    );
  }
  function requireSupported() {
    if (!supportsPictureReplacement()) throw Error('PictureReplacementAbiUnavailable');
  }
  return {
    supportsPictureReplacement,
    pictureReplacementOwner(selector) {
      check();
      const selected = checkedPictureReplacementSelector(selector);
      requireSupported();
      const bytes = output(() => wasm[ownerQuery](selected.section, selected.pictureNode)).bytes;
      if (!(bytes instanceof Uint8Array) || bytes.length > 16 * 1024)
        throw Error('InvalidPictureReplacementOwner');
      const owner = checkedPictureReplacementOwner(JSON.parse(utf8.decode(bytes)));
      if (
        owner.format !== format ||
        owner.section !== selected.section ||
        owner.pictureNode !== selected.pictureNode
      )
        throw Error('PictureReplacementBindingMismatch');
      if (owner.binding.session.length > 256) throw Error('InvalidPictureReplacementOwner');
      return checkedPictureReplacementOwner({
        ...owner,
        binding: { ...owner.binding, session: scope + owner.binding.session },
      });
    },
    replacePicture(value, imageBytes) {
      check();
      const owner = checkedPictureReplacementOwner(value);
      if (owner.format !== format) throw Error('PictureReplacementBindingMismatch');
      if (!owner.binding.session.startsWith(scope)) throw Error('ForeignPictureReplacementOwner');
      const nativeSession = owner.binding.session.slice(scope.length);
      if (!nativeSession || nativeSession.length > 256)
        throw Error('InvalidPictureReplacementOwner');
      const image = copyPictureReplacementImage(imageBytes);
      requireSupported();
      const wire = encoder.encode(
        JSON.stringify({ ...owner, binding: { ...owner.binding, session: nativeSession } }),
      );
      let observed;
      try {
        return memory.withBytes(image, (imagePtr, imageSize) => {
          observed = applyNativeEdit(
            memory,
            wire,
            (ptr, size) => wasm[replace](ptr, size, imagePtr, imageSize),
            'InvalidPictureReplacementResult',
          );
          return observed;
        });
      } catch (error) {
        if (!observed) throw error;
        return {
          ...observed,
          cleanupError: error?.message || String(error),
          refreshRequired: true,
        };
      }
    },
  };
}
