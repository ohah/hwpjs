import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { createPictureReplacer } from '../../../js/picture-resource-replacement.mjs';
import {
  copyPictureInput,
  PICTURE_REPLACEMENT_LIMITS as limits,
} from '../../../js/picture-replacement-input.mjs';
import { openDocument } from './engine.ts';
import { createDocumentImages } from './document-images.ts';
import { parseObjectReference, canonicalImageId } from './object-reference.ts';
import type { DocumentFormat } from './types/native-document.ts';
import type { ObservationSdk } from './types/document-view.ts';

interface ReplacementDocument {
  format: DocumentFormat;
  sourceSha256: string;
  sectionCount: number;
  sdk: ObservationSdk;
  close(): void | Promise<void>;
}
export interface PictureReplacementDependencies {
  openDocument?: (input: {
    bytes: Uint8Array;
    wasm: Uint8Array;
    expectedSha256: string;
  }) => Promise<ReplacementDocument>;
  createDocumentImages?: typeof createDocumentImages;
  createReplacer?: typeof createPictureReplacer;
}
export interface PictureReplacementResult {
  format: DocumentFormat;
  sourceSha256: string;
  bytes: Uint8Array;
  imageSha256: string;
  previewStale: true;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Object.is(value, -0) &&
  value >= 0 &&
  value <= 0xffffffff;
const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
};

// Observes a source snapshot, then uses an independent Native file transform.
// The read model, editor Session and its history are never used as a writer.
export async function replaceDocumentImage(
  input: unknown,
  dependencies: PictureReplacementDependencies = {},
): Promise<PictureReplacementResult> {
  if (!record(input)) throw new TypeError('InvalidPictureReplacementInput');
  const fields: Record<string, unknown> = Object.create(null);
  if (
    Reflect.ownKeys(input).some(
      (key) => !['bytes', 'wasm', 'reference', 'imageBytes'].includes(String(key)),
    )
  )
    throw new TypeError('InvalidPictureReplacementInput');
  for (const key of ['bytes', 'wasm', 'reference', 'imageBytes']) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('InvalidPictureReplacementInput');
    fields[key] = descriptor.value;
  }
  const source = copyPictureInput(fields.bytes, limits.documentBytes, 'Document');
  const wasm = copyPictureInput(fields.wasm, limits.wasmBytes, 'Wasm');
  const image = copyPictureInput(fields.imageBytes, limits.imageBytes, 'Image');
  const reference = parseObjectReference(fields.reference);
  if (reference.kind !== 'image') throw new TypeError('ExpectedImageReference');
  const format = detectDocumentFormat(source);
  if (format !== reference.format) throw new Error('ObjectReferenceFormatMismatch');
  const open = dependencies.openDocument ?? openDocument;
  const images = dependencies.createDocumentImages ?? createDocumentImages;
  const createReplacer = dependencies.createReplacer ?? createPictureReplacer;
  const [sourceSha256, imageSha256] = await Promise.all([digest(source), digest(image)]);
  if (sourceSha256 !== reference.sourceSha256) throw new Error('StaleObjectReference');
  let document: ReplacementDocument | undefined;
  let inventory: ReturnType<typeof createDocumentImages> | undefined;
  let replacer: Awaited<ReturnType<typeof createPictureReplacer>> | undefined;
  let result: PictureReplacementResult | undefined;
  let failed = false,
    failure: unknown;
  try {
    document = await open({
      bytes: Uint8Array.from(source),
      wasm: Uint8Array.from(wasm),
      expectedSha256: sourceSha256,
    });
    if (
      !document ||
      document.format !== format ||
      document.sourceSha256 !== sourceSha256 ||
      !uint(document.sectionCount) ||
      document.sectionCount < 1 ||
      document.sectionCount > 4096 ||
      !record(document.sdk) ||
      typeof document.close !== 'function'
    )
      throw new Error('InvalidPictureReplacementDocument');
    inventory = images({
      sdk: document.sdk,
      format,
      sourceSha256,
      sectionCount: document.sectionCount,
    });
    const listing = inventory.list();
    if (
      listing.version !== 1 ||
      listing.format !== format ||
      listing.sourceSha256 !== sourceSha256 ||
      !Array.isArray(listing.images) ||
      listing.images.length > 4096
    )
      throw new Error('InvalidImageInventory');
    const members = new Map<string, (typeof listing.images)[number]>();
    for (const row of listing.images) {
      if (
        !record(row) ||
        !record(row.source) ||
        !uint(row.source.section) ||
        row.source.section >= document.sectionCount ||
        !uint(row.source.pictureNode) ||
        row.id !==
          canonicalImageId({ format, section: row.source.section, node: row.source.pictureNode }) ||
        members.has(row.id)
      )
        throw new Error('InvalidImageInventory');
      members.set(row.id, row);
    }
    const selected = members.get(canonicalImageId(reference));
    if (!selected) throw new Error('ImageReferenceNotFound');
    // HWP5 references identify the component; Native replacement selects SHAPE_PICTURE.
    const pictureNode =
      format === 'hwp5' ? selected.source.recordNode : selected.source.pictureNode;
    if (!uint(pictureNode)) throw new Error('InvalidImageInventory');
    replacer = await createReplacer(Uint8Array.from(wasm));
    const output = replacer.replace(source, {
      format,
      section: reference.section,
      pictureNode,
      bytes: image,
    });
    const bytes = copyPictureInput(output, limits.outputBytes, 'Output');
    if (detectDocumentFormat(bytes) !== format) throw new Error('PictureReplacementFormatMismatch');
    result = { format, sourceSha256, bytes, imageSha256, previewStale: true };
  } catch (error) {
    failed = true;
    failure = error;
  }
  const errors: unknown[] = [];
  for (const resource of [replacer, inventory, document]) {
    if (resource && typeof resource.close === 'function') {
      try {
        await resource.close();
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (errors.length)
    throw new AggregateError(
      failed ? [failure, ...errors] : errors,
      'PictureReplacementCleanupFailed',
    );
  if (failed) throw failure;
  if (!result) throw new Error('InvalidPictureReplacementResult');
  return result;
}
