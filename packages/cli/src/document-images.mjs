import { validateHwp5PictureSources } from '../../../js/hwp5-picture-sources.mjs';
import { canonicalImageId } from './object-reference.mjs';

export const DOCUMENT_IMAGE_LIMITS = Object.freeze({
  maxImages: 4096,
  maxBytes: 8 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
});
const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const digest = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const siteStates = new Set([
  'located',
  'conditional',
  'unsupported_anchor',
  'missing_host',
  'ambiguous_host',
]);
const unsupported = new Set([
  'ExternalLink',
  'ExternalPictureImage',
  'UnsupportedBinDataType',
  'AbsentBinaryResource',
  'MissingPictureImage',
  'UnsupportedPictureDisplayHost',
  'UnsupportedPictureDisplayNode',
  'UnsupportedPictureSwitchHost',
  'UnsupportedPictureAnchor',
  'Hwp5BinaryResourceAbiUnavailable',
  'HwpxPictureBytesAbiUnavailable',
]);
export class DocumentImageError extends Error {
  constructor(code, status = 'failed', reason = code) {
    super(code);
    this.name = 'DocumentImageError';
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}
const fail = (code) => {
  throw new DocumentImageError(code);
};

/** Encoded header identification only, never pixel decoding/image validity.
 * Unknown or malformed headers remain extractable raw data; names/MIME declarations
 * from a document are deliberately not consulted. */
function identify(bytes) {
  const at = (offset, text) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let type;
  if (
    bytes.length >= 33 &&
    bytes[0] === 137 &&
    at(1, 'PNG\r\n\x1a\n') &&
    view.getUint32(8) === 13 &&
    at(12, 'IHDR') &&
    view.getUint32(16) > 0 &&
    view.getUint32(20) > 0 &&
    bytes[26] === 0 &&
    bytes[27] === 0 &&
    bytes[28] <= 1 &&
    { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[
      bytes[25]
    ]?.includes(bytes[24])
  )
    type = ['image/png', '.png'];
  else if (
    bytes.length >= 13 &&
    (at(0, 'GIF87a') || at(0, 'GIF89a')) &&
    view.getUint16(6, true) > 0 &&
    view.getUint16(8, true) > 0
  )
    type = ['image/gif', '.gif'];
  else if (
    bytes.length >= 54 &&
    at(0, 'BM') &&
    view.getUint32(2, true) === bytes.length &&
    view.getUint32(10, true) >= 54 &&
    view.getUint32(10, true) <= bytes.length &&
    view.getUint32(14, true) >= 40 &&
    view.getUint32(14, true) <= bytes.length - 14 &&
    view.getInt32(18, true) > 0 &&
    view.getInt32(22, true) !== 0 &&
    view.getUint16(26, true) === 1
  )
    type = ['image/bmp', '.bmp'];
  else if (
    bytes.length >= 20 &&
    at(0, 'RIFF') &&
    at(8, 'WEBP') &&
    view.getUint32(4, true) === bytes.length - 8 &&
    ['VP8 ', 'VP8L', 'VP8X'].some((tag) => at(12, tag)) &&
    view.getUint32(16, true) <= bytes.length - 20
  )
    type = ['image/webp', '.webp'];
  else if (
    bytes.length >= 12 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  ) {
    // Verify bounded marker framing up to a frame header. No entropy/pixel decode.
    let offset = 2,
      markers = 0;
    while (offset + 4 <= bytes.length && markers++ < 4096) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1],
        length = view.getUint16(offset + 2);
      if (length < 2 || length > bytes.length - offset - 2) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length >= 8 && view.getUint16(offset + 5) > 0 && view.getUint16(offset + 7) > 0)
          type = ['image/jpeg', '.jpg'];
        break;
      }
      if (marker === 218 || marker === 217) break;
      offset += 2 + length;
    }
  }
  return type
    ? {
        mime: type[0],
        extension: type[1],
        recognized: true,
        validation: 'signature-and-header-only',
      }
    : {
        mime: 'application/octet-stream',
        extension: '.bin',
        recognized: false,
        validation: 'unrecognized-or-unsupported-header',
      };
}

/** Borrow an opened SDK; caller binds the supplied SHA to its source bytes and
 * owns SDK close. This reader retains only bounded detached encoded bytes.
 * HX pictureBytes has an existing 64MiB Native allocation bound BEFORE our JS
 * size check. maxBytes is not a pre-allocation hard cap for that API.
 * HX does not expose an OPF resource identity, so it deduplicates source nodes
 * only; H5 deduplicates global DocInfo ordinals. No filesystem/network calls. */
export function createDocumentImages({
  sdk,
  format,
  sourceSha256,
  sectionCount,
  limits = {},
} = {}) {
  if (!['hwp5', 'hwpx'].includes(format)) fail('InvalidDocumentFormat');
  if (!digest(sourceSha256)) fail('InvalidSourceSha256');
  if (!sdk || typeof sdk !== 'object') fail('MissingSdk');
  if (!Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 4096)
    fail('SectionLimitExceeded');
  if (
    !limits ||
    typeof limits !== 'object' ||
    Array.isArray(limits) ||
    Object.keys(limits).some((key) => !Object.hasOwn(DOCUMENT_IMAGE_LIMITS, key))
  )
    fail('InvalidImageLimits');
  const budget = { ...DOCUMENT_IMAGE_LIMITS, ...limits };
  for (const [key, value] of Object.entries(budget))
    if (
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > { maxImages: 4096, maxBytes: 32 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 }[key]
    )
      fail('InvalidImageLimits');
  const rows = new Map(),
    resources = new Map();
  let totalBytes = 0,
    closed = false,
    borrowed = sdk;
  const ready = () => {
    if (closed) fail('DocumentImagesClosed');
  };
  for (let section = 0; section < sectionCount; section++) {
    let sites;
    const inventoryMethod = format === 'hwp5' ? 'pictureSources' : 'pictureSites';
    if (typeof sdk[inventoryMethod] !== 'function')
      throw new DocumentImageError(
        'ImageInventoryUnavailable',
        'unsupported',
        'PictureInventoryApiUnavailable',
      );
    try {
      sites = format === 'hwp5' ? sdk.pictureSources(section, 'base73') : sdk.pictureSites(section);
    } catch (error) {
      throw new DocumentImageError(
        'ImageInventoryUnavailable',
        /AbiUnavailable|Unsupported/.test(error?.message ?? '') ? 'unsupported' : 'failed',
      );
    }
    if (!Array.isArray(sites)) fail('InvalidImageInventory');
    if (sites.length > budget.maxImages - rows.size) fail('ImageCountLimitExceeded');
    if (format === 'hwp5') validateHwp5PictureSources(sites);
    for (const row of sites) {
      const node = format === 'hwp5' ? row.component_node : row?.pictureNode;
      if (!uint(node)) fail('InvalidImageIdentity');
      if (
        format === 'hwpx' &&
        (!siteStates.has(row.state) ||
          !(row.paragraph === null || (uint(row.paragraph) && row.paragraph > 0)) ||
          !(row.anchorUnit === null || uint(row.anchorUnit)))
      )
        fail('InvalidImageInventory');
      const id = canonicalImageId({ format, section, node });
      if (rows.has(id)) fail('DuplicateImageIdentity');
      const source =
        format === 'hwp5'
          ? {
              section,
              pictureNode: node,
              recordNode: row.picture_node,
              ownerNode: row.owner_node,
              resourceOrdinal: row.bin_data_id,
            }
          : { section, pictureNode: node, paragraph: row.paragraph, anchorUnit: row.anchorUnit };
      const resourceKey =
        format === 'hwp5' ? `docinfo:${row.bin_data_id}` : `source:${section}:${node}`;
      const entry = {
        id,
        source,
        resourceKey,
        status: 'unread',
        reason: 'PayloadNotRead',
        mime: null,
        extension: null,
        recognized: null,
        validation: 'not-read',
        byteLength: null,
      };
      rows.set(id, entry);
      if (!resources.has(resourceKey))
        resources.set(resourceKey, { refs: [], bytes: null, error: null });
      resources.get(resourceKey).refs.push(entry);
    }
  }
  sdk = null; // The only retained SDK reference is borrowed, cleared by close().
  const copy = (entry) => ({ ...entry, source: { ...entry.source } });
  return {
    list() {
      ready();
      return {
        version: 1,
        format,
        sourceSha256,
        images: [...rows.values()].map(copy),
        limits: { ...budget },
        budget: { retainedUniqueBytes: totalBytes, resourceKeys: resources.size },
        coverage: {
          scope: 'section-picture-sites',
          sectionCount,
          references: rows.size,
          inventoryComplete: true,
          payloadsRead: [...rows.values()].filter((row) => row.status === 'ready').length,
          payloadsFailed: [...rows.values()].filter(
            (row) => row.status === 'failed' || row.status === 'unsupported',
          ).length,
          resourceIdentity: format === 'hwp5' ? 'docinfo-ordinal' : 'picture-source-node',
          masterPagesIncluded: false,
          imageBrushesIncluded: false,
        },
        nativePayloadLimitBytes: format === 'hwp5' ? budget.maxBytes : 64 * 1024 * 1024,
        jsByteLimitTiming:
          format === 'hwp5' ? 'native-decoded-payload-limit' : 'after-native-payload-copy',
      };
    },
    read(id, options) {
      ready();
      if (
        !options ||
        typeof options !== 'object' ||
        Array.isArray(options) ||
        Object.keys(options).some((k) => k !== 'sourceSha256') ||
        !digest(options.sourceSha256)
      )
        fail('InvalidSourceSha256');
      if (options.sourceSha256 !== sourceSha256) fail('SourceSha256Mismatch');
      if (
        typeof id !== 'string' ||
        id.length > 80 ||
        !/^(hwp5|hwpx):s(0|[1-9][0-9]*):i(0|[1-9][0-9]*)$/.test(id)
      )
        fail('InvalidImageId');
      const entry = rows.get(id);
      if (!entry) fail('UnknownImageId');
      const resource = resources.get(entry.resourceKey);
      if (!resource.bytes && !resource.error) {
        try {
          const bytesMethod = format === 'hwp5' ? 'binaryResource' : 'pictureBytes';
          if (typeof borrowed[bytesMethod] !== 'function')
            throw new Error(
              format === 'hwp5'
                ? 'Hwp5BinaryResourceAbiUnavailable'
                : 'HwpxPictureBytesAbiUnavailable',
            );
          const result =
            format === 'hwp5'
              ? borrowed.binaryResource(entry.source.resourceOrdinal, { maxBytes: budget.maxBytes })
              : borrowed.pictureBytes(entry.source.section, entry.source.pictureNode);
          if (!(result instanceof Uint8Array)) fail('InvalidImageBytes');
          if (!result.length) fail('EmptyImageBytes');
          if (result.length > budget.maxBytes) fail('ImageBytesLimitExceeded');
          if (result.length > budget.maxTotalBytes - totalBytes)
            fail('ImageTotalBytesLimitExceeded');
          const bytes = Uint8Array.from(result),
            metadata = identify(bytes);
          resource.bytes = bytes;
          totalBytes += bytes.length;
          for (const ref of resource.refs)
            Object.assign(ref, metadata, {
              status: 'ready',
              reason: metadata.recognized ? null : 'UnrecognizedOrUnsupportedImageHeader',
              byteLength: bytes.length,
            });
        } catch (error) {
          const code =
            error instanceof DocumentImageError
              ? error.code
              : unsupported.has(error?.message)
                ? error.message
                : error?.message === 'LimitExceeded'
                  ? 'ImageBytesLimitExceeded'
                  : 'NativeImageReadFailed';
          const status = unsupported.has(code) ? 'unsupported' : 'failed';
          resource.error = { code, status };
          for (const ref of resource.refs) Object.assign(ref, { status, reason: code });
        }
      }
      if (resource.error) throw new DocumentImageError(resource.error.code, resource.error.status);
      return { ...copy(entry), sourceSha256, bytes: Uint8Array.from(resource.bytes) };
    },
    close() {
      closed = true;
      borrowed = null;
      resources.clear();
      rows.clear();
      totalBytes = 0;
    },
  };
}
