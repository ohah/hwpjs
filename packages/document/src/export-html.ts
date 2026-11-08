import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { copyDocumentBytes } from './bytes.ts';
import type { DocumentBytes } from './bytes.ts';
import { openReadOnlyDocument } from './read-document.ts';
import type { ReadOnlyDocument } from './read-document.ts';
import { readDocumentModel } from './document-model.ts';
import { createDocumentImages } from './document-images.ts';
import { canonicalImageId } from './object-reference.ts';
import { prepareDocumentRender } from './render.ts';
import { renderDocumentHTML } from './render-html.ts';
import { createDisplayEscaper } from './render-escape.ts';
import type {
  Diagnostic,
  DocumentView,
  DocumentBlock,
  RenderReference,
} from './types/document-view.ts';
import type { DocumentFormat } from './types/native.ts';
import { HTML_EXPORT_LIMITS } from './limits.ts';
export { HTML_EXPORT_LIMITS } from './limits.ts';
import type { HTMLConversionOptions } from './types/conversion.js';
export type { HTMLConversionOptions } from './types/conversion.js';
export interface HTMLExportInput extends HTMLConversionOptions {
  bytes: DocumentBytes;
}
export interface HTMLExportResult {
  format: DocumentFormat;
  sourceSha256: string;
  html: string;
  semanticOnly: true;
  warnings: string[];
}
export interface HTMLExportDependencies {
  openDocument?: typeof openReadOnlyDocument;
  readDocumentModel?: typeof readDocumentModel;
  createDocumentImages?: typeof createDocumentImages;
  renderDocumentHTML?: typeof renderDocumentHTML;
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Object.is(value, -0) &&
  value >= 0 &&
  value <= 0xffffffff;
const displayWarning = createDisplayEscaper({ format: 'text', view: 'structure' });
function warningStrings(warnings: readonly Diagnostic[]): string[] {
  let units = 0;
  return warnings.map((value) => {
    const addresses: string[] = [];
    if (value.source)
      for (const key of [
        'section',
        'paragraph',
        'node',
        'pictureNode',
        'recordNode',
        'componentNode',
        'ownerNode',
        'tableNode',
        'listNode',
        'cellNode',
        'anchorUnit',
      ]) {
        const property = Object.getOwnPropertyDescriptor(value.source, key);
        if (property && Object.hasOwn(property, 'value') && uint(property.value))
          addresses.push(key + '=' + property.value);
      }
    if (value.code.length + value.message.length > 2048)
      throw new RangeError('HtmlWarningLimitExceeded');
    const text = displayWarning(
      '[' +
        value.code +
        '] ' +
        value.message +
        (addresses.length ? ' (' + addresses.join(', ') + ')' : ''),
    );
    units += text.length;
    if (text.length > 2048 || units > 1024 * 1024) throw new RangeError('HtmlWarningLimitExceeded');
    return text;
  });
}
function validateNativeScope(
  model: DocumentView,
  count: number,
  references: ReadonlyMap<object, RenderReference>,
): void {
  const source = (value: unknown, expected?: number) => {
    if (value === undefined) return;
    if (!object(value)) throw new Error('HtmlModelSourceMismatch');
    const section = value.section;
    if (
      section !== undefined &&
      section !== null &&
      (!uint(section) || section >= count || (expected !== undefined && section !== expected))
    )
      throw new Error('HtmlModelSourceMismatch');
  };
  const stack: { block: DocumentBlock; section?: number }[] = [];
  const sections = new Set<number>();
  for (const section of model.sections) {
    source(section.source);
    const at = section.source.section;
    if (sections.has(at)) throw new Error('HtmlModelSectionMismatch');
    sections.add(at);
    for (const block of section.body) stack.push({ block, section: at });
    for (const area of [section.header, section.footer]) {
      if (area.inheritance.fromSection !== undefined && area.inheritance.fromSection >= count)
        throw new Error('HtmlModelSourceMismatch');
      for (const definition of area.definitions) {
        source(definition.source, at);
        for (const block of definition.blocks) stack.push({ block, section: at });
      }
    }
  }
  if (model.coverage.inventoryComplete && sections.size !== count)
    throw new Error('HtmlModelSectionMismatch');
  for (const item of model.unplaced) {
    source(item.diagnostic.source);
    stack.push({ block: item.block });
  }
  for (const warning of model.warnings) source(warning.source);
  for (const ref of references.values())
    if (ref.section >= count) throw new Error('HtmlModelSourceMismatch');
  while (stack.length) {
    const { block, section } = stack.pop()!;
    source(block.type === 'image' ? block.sourceInfo : block.source, section);
    if (block.type === 'unknown') source(block.diagnostic.source);
    if (block.type === 'table')
      for (const cell of block.cells) {
        source(cell.source, section);
        for (const child of cell.blocks)
          stack.push({ block: child, ...(section === undefined ? {} : { section }) });
      }
  }
}
function capture(value: unknown, withBytes: boolean): Record<string, unknown> {
  if (!object(value)) throw new TypeError('ExplicitWasmRequired');
  const allowed = ['wasm', 'embedImages', 'title', 'fragment', ...(withBytes ? ['bytes'] : [])];
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key))
      throw new TypeError('InvalidHtmlExportField');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new TypeError('InvalidHtmlExportField');
    fields[key] = descriptor.value;
  }
  if (!Object.hasOwn(fields, 'wasm') || fields.wasm === undefined)
    throw new TypeError('ExplicitWasmRequired');
  if (
    fields.embedImages !== undefined &&
    fields.embedImages !== 'supported' &&
    fields.embedImages !== 'none'
  )
    throw new TypeError('InvalidHtmlImagePolicy');
  if (
    fields.title !== undefined &&
    (typeof fields.title !== 'string' || fields.title.length > 1024)
  )
    throw new TypeError('InvalidHtmlTitle');
  if (fields.fragment !== undefined && typeof fields.fragment !== 'boolean')
    throw new TypeError('InvalidHtmlFragmentOption');
  return fields;
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 8190) {
    let chunk = '';
    const end = Math.min(start + 8190, bytes.length);
    for (let at = start; at < end; at += 3) {
      const a = bytes[at]!,
        b = at + 1 < bytes.length ? bytes[at + 1]! : 0,
        c = at + 2 < bytes.length ? bytes[at + 2]! : 0;
      chunk +=
        ALPHABET[a >>> 2]! +
        ALPHABET[((a & 3) << 4) | (b >>> 4)]! +
        (at + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >>> 6)]! : '=') +
        (at + 2 < bytes.length ? ALPHABET[c & 63]! : '=');
    }
    chunks.push(chunk);
  }
  return chunks.join('');
}
const warning = (code: string, message: string, section?: number, node?: number): Diagnostic => ({
  code,
  message: message.slice(0, 512),
  ...(section === undefined ? {} : { source: { section, node } }),
});
function byteBudget(text: string): void {
  let bytes = 0;
  for (const character of text) {
    const n = character.codePointAt(0)!;
    bytes += n <= 127 ? 1 : n <= 2047 ? 2 : n <= 65535 ? 3 : 4;
    if (bytes > HTML_EXPORT_LIMITS.outputBytes) throw new RangeError('HtmlOutputByteLimitExceeded');
  }
}
/** 원문·WASM 스냅샷에서 같은 모델과 renderer를 사용한다. 파일·네트워크 기본값은 없다. */
export async function exportDocumentHTML(
  input: unknown,
  dependencies: HTMLExportDependencies = {},
): Promise<HTMLExportResult> {
  const fields = capture(input, true);
  const bytes = copyDocumentBytes(fields.bytes, HTML_EXPORT_LIMITS.documentBytes, 'Document');
  const wasm = copyDocumentBytes(fields.wasm, HTML_EXPORT_LIMITS.wasmBytes, 'Wasm');
  const format = detectDocumentFormat(bytes);
  if (!globalThis.crypto?.subtle) throw new Error('WebCryptoUnavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const sourceSha256 = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  let document: ReadOnlyDocument | undefined,
    images: ReturnType<typeof createDocumentImages> | undefined;
  let result: HTMLExportResult | undefined,
    failed = false,
    failure: unknown;
  try {
    document = await (dependencies.openDocument ?? openReadOnlyDocument)({
      bytes: copyDocumentBytes(bytes, HTML_EXPORT_LIMITS.documentBytes, 'Document'),
      wasm: copyDocumentBytes(wasm, HTML_EXPORT_LIMITS.wasmBytes, 'Wasm'),
      sourceSha256,
    });
    if (
      document.format !== format ||
      document.sourceSha256 !== sourceSha256 ||
      !Number.isSafeInteger(document.sectionCount) ||
      document.sectionCount < 1 ||
      document.sectionCount > 4096
    )
      throw new Error('InvalidHtmlReadDocument');
    const model = await (dependencies.readDocumentModel ?? readDocumentModel)({
      format,
      sourceSha256,
      sectionCount: document.sectionCount,
      sdk: document.sdk,
    });
    if (model.version !== 1 || model.format !== format || model.sourceSha256 !== sourceSha256)
      throw new Error('InvalidHtmlDocumentModel');
    const { references } = prepareDocumentRender(model, { format: 'text', view: 'content' });
    validateNativeScope(model, document.sectionCount, references);
    const additions: Diagnostic[] = [];
    const imageData = new Map<string, string>();
    const refs = [...references.values()].filter((r) => r.kind === 'image');
    if (fields.embedImages !== 'none' && refs.length) {
      try {
        images = (dependencies.createDocumentImages ?? createDocumentImages)({
          sdk: document.sdk,
          format,
          sourceSha256,
          sectionCount: document.sectionCount,
          limits: {
            maxBytes: HTML_EXPORT_LIMITS.imageBytes,
            maxTotalBytes: HTML_EXPORT_LIMITS.imageTotalBytes,
          },
        });
      } catch {
        additions.push(
          warning(
            'HtmlImageInventoryUnavailable',
            '이미지 바이트 재고를 확인하지 못해 논리 참조만 남겼습니다.',
          ),
        );
      }
      if (images) {
        const listing = images.list();
        if (
          listing.version !== 1 ||
          listing.format !== format ||
          listing.sourceSha256 !== sourceSha256 ||
          !Array.isArray(listing.images) ||
          listing.images.length > 4096
        )
          throw new Error('InvalidHtmlImageInventory');
        const members = new Map<string, (typeof listing.images)[number]>();
        for (const row of listing.images) {
          if (
            !object(row) ||
            !object(row.source) ||
            !uint(row.source.section) ||
            row.source.section >= document.sectionCount ||
            !uint(row.source.pictureNode) ||
            typeof row.id !== 'string' ||
            members.has(row.id) ||
            row.id !==
              canonicalImageId({
                format,
                section: row.source.section,
                node: row.source.pictureNode,
              }) ||
            typeof row.resourceKey !== 'string' ||
            (format === 'hwp5'
              ? !uint(row.source.resourceOrdinal) ||
                !uint(row.source.recordNode) ||
                !uint(row.source.ownerNode) ||
                row.resourceKey !== `docinfo:${row.source.resourceOrdinal}`
              : row.resourceKey !== `source:${row.source.section}:${row.source.pictureNode}`)
          )
            throw new Error('InvalidHtmlImageInventory');
          members.set(row.id, row);
        }
        const supported = new Set([
          'image/png',
          'image/jpeg',
          'image/gif',
          'image/webp',
          'image/bmp',
        ]);
        const cache = new Map<string, string>(),
          unavailable = new Set<string>();
        let imageUnits = 0,
          exhausted = false;
        for (const ref of refs) {
          const id = canonicalImageId(ref),
            member = members.get(id);
          if (!member) {
            additions.push(
              warning(
                'HtmlImageReferenceUnavailable',
                '이미지 재고에 참조가 없어 바이트를 포함하지 않았습니다.',
                ref.section,
                ref.node,
              ),
            );
            continue;
          }
          let uri = cache.get(member.resourceKey);
          if (unavailable.has(member.resourceKey)) {
            additions.push(
              warning(
                'HtmlImageBytesUnavailable',
                '해당 자원은 이미지 바이트를 포함하지 못해 논리 참조만 남겼습니다.',
                ref.section,
                ref.node,
              ),
            );
            continue;
          }
          if (!uri && !exhausted) {
            try {
              const value = images.read(id, { sourceSha256 });
              if (
                !object(value) ||
                !object(value.source) ||
                value.id !== id ||
                value.sourceSha256 !== sourceSha256 ||
                value.resourceKey !== member.resourceKey ||
                value.source.section !== ref.section ||
                value.source.pictureNode !== ref.node
              )
                throw new Error('HtmlImageSourceMismatch');
              if (value.recognized !== true || !value.mime || !supported.has(value.mime)) {
                unavailable.add(member.resourceKey);
                additions.push(
                  warning(
                    'HtmlImageFormatUnsupported',
                    '지원되는 raster 형식으로 관측되지 않아 바이트를 포함하지 않았습니다.',
                    ref.section,
                    ref.node,
                  ),
                );
                continue;
              }
              const raw = copyDocumentBytes(value.bytes, HTML_EXPORT_LIMITS.imageBytes, 'Image');
              const prefix = `data:${value.mime};base64,`,
                length = prefix.length + 4 * Math.ceil(raw.length / 3);
              if (length + imageUnits > HTML_EXPORT_LIMITS.imageDataUnits) {
                unavailable.add(member.resourceKey);
                additions.push(
                  warning(
                    'HtmlImageBudgetExceeded',
                    '누적 이미지 출력 예산을 넘어 바이트를 포함하지 않았습니다.',
                    ref.section,
                    ref.node,
                  ),
                );
                continue;
              }
              uri = prefix + base64(raw);
              cache.set(member.resourceKey, uri);
            } catch (error) {
              if (error instanceof Error && error.message === 'HtmlImageSourceMismatch')
                throw error;
              if (error instanceof Error && error.message === 'ImageTotalBytesLimitExceeded')
                exhausted = true;
              unavailable.add(member.resourceKey);
              additions.push(
                warning(
                  'HtmlImageBytesUnavailable',
                  '이미지 바이트를 읽지 못해 논리 참조만 남겼습니다.',
                  ref.section,
                  ref.node,
                ),
              );
              continue;
            }
          }
          if (!uri || imageUnits + uri.length > HTML_EXPORT_LIMITS.imageDataUnits) {
            additions.push(
              warning(
                'HtmlImageBudgetExceeded',
                '누적 이미지 예산으로 바이트를 포함하지 않았습니다.',
                ref.section,
                ref.node,
              ),
            );
            continue;
          }
          imageUnits += uri.length;
          imageData.set(ref.text, uri);
        }
      }
    }
    const warnings = [...model.warnings, ...additions];
    const publicWarnings = warningStrings(warnings);
    const html = (dependencies.renderDocumentHTML ?? renderDocumentHTML)(
      { ...model, warnings },
      {
        imageData,
        ...(fields.title === undefined ? {} : { title: fields.title as string }),
        ...(fields.fragment === undefined ? {} : { fragment: fields.fragment as boolean }),
      },
    );
    if (typeof html !== 'string' || !html.isWellFormed())
      throw new Error('InvalidHtmlRenderOutput');
    byteBudget(html);
    result = { format, sourceSha256, html, semanticOnly: true, warnings: publicWarnings };
  } catch (error) {
    failed = true;
    failure = error;
  }
  const cleanup: unknown[] = [];
  for (const resource of [images, document])
    if (resource) {
      try {
        await resource.close();
      } catch (error) {
        cleanup.push(error);
      }
    }
  if (cleanup.length)
    throw new AggregateError(failed ? [failure, ...cleanup] : cleanup, 'HtmlExportCleanupFailed');
  if (failed) throw failure;
  if (!result) throw new Error('MissingHtmlExportResult');
  return result;
}
export async function toHtml(
  bytes: DocumentBytes,
  options: HTMLConversionOptions,
): Promise<string> {
  const values = capture(options, false);
  return (await exportDocumentHTML({ bytes, ...values })).html;
}
