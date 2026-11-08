import { openDocument } from './engine.ts';
import { readDocumentModel } from './document-model.ts';
import { LIMITS } from './model/common.ts';
import { createDocument, DOCUMENT_CREATE_LIMITS } from './document-create.ts';
import { detectDocumentFormat } from '../../../js/document-format.mjs';

import type {
  DocumentFormat,
  DocumentOpenOptions,
  OpenedDocument,
} from './types/native-document.ts';
import type { DocumentBlock, DocumentView, DocumentReadContext } from './types/document-view.ts';
import type { CreatedDocumentResult, DocumentCreateOptions } from './document-create.ts';

export interface DocumentConvertOptions {
  bytes: Uint8Array;
  wasm: Uint8Array;
  to: DocumentFormat;
  lossPolicy?: 'reject' | 'text-only';
  allowStaleLayout?: boolean;
  expectedSha256?: string;
}
export interface DocumentConversionReport {
  lossPolicy: 'reject' | 'text-only';
  lossless: false;
  sourceFormat: DocumentFormat | null;
  targetFormat: DocumentFormat;
  preserved: string;
  notPreserved: string[];
  tableTraversal: string;
  bodyParagraphs: number;
  emptyParagraphs: number;
  flattenedTables: number;
  droppedObjectCount: number;
  lineBreakPolicy: string;
  sourceInventoryComplete?: boolean | null;
  sourceObjectsKnown?: boolean | null;
  warningCount?: number | null;
  warningCodes?: string[];
  warningDetailsOmitted?: number;
}
export interface ConvertedDocumentResult extends CreatedDocumentResult {
  sourceFormat: DocumentFormat;
  sourceSha256: string;
  lossPolicy: 'text-only';
  lossless: false;
  report: DocumentConversionReport;
}
export interface DocumentConvertDependencies {
  openDocument?: (options: DocumentOpenOptions) => Promise<OpenedDocument>;
  readDocumentModel?: (context: DocumentReadContext) => Promise<DocumentView>;
  createDocument?: (options: DocumentCreateOptions) => Promise<CreatedDocumentResult>;
}

const OMITTED = Object.freeze([
  '글자·문단 서식, 글꼴과 스타일',
  '표의 행·열·병합·셀 기하와 테두리·채우기',
  '이미지·도형·차트·수식·OLE 등의 개체',
  '머리말·꼬리말·각주·미주 등 본문 밖 영역',
  '용지·구역·단·페이지 배치 및 문서 메타데이터',
]);

export class DocumentConversionError extends Error {
  readonly code: string;
  readonly report: DocumentConversionReport;
  constructor(code: string, report: DocumentConversionReport, options?: ErrorOptions) {
    super(code, options);
    this.name = 'DocumentConversionError';
    this.code = code;
    this.report = report;
  }
}

function bodyText(model: DocumentView, report: DocumentConversionReport): string {
  if (model?.version !== 1 || !Array.isArray(model.sections) || !Array.isArray(model.unplaced))
    throw new DocumentConversionError('InvalidConversionModel', report);
  if (
    model.coverage?.unreadableSections !== 0 ||
    model.coverage?.paragraphTotal !== model.coverage?.observedParagraphs ||
    model.unplaced.length !== 0
  )
    throw new DocumentConversionError('TextOnlySourceIncomplete', report);
  const lines: string[] = [];
  const seen = new Set<DocumentBlock>();
  const stack: { block: DocumentBlock; depth: number }[] = [];
  let units = 0;
  for (let i = model.sections.length - 1; i >= 0; i--) {
    const body = model.sections[i]?.body;
    if (!Array.isArray(body)) throw new DocumentConversionError('InvalidConversionModel', report);
    for (let j = body.length - 1; j >= 0; j--) stack.push({ block: body[j], depth: 0 });
  }
  while (stack.length) {
    const next = stack.pop();
    if (!next) throw new DocumentConversionError('InvalidConversionModel', report);
    const { block, depth } = next;
    if (!block || typeof block !== 'object' || seen.has(block) || depth > LIMITS.maxDepth)
      throw new DocumentConversionError('InvalidConversionModel', report);
    seen.add(block);
    if (seen.size > LIMITS.maxBlocks)
      throw new DocumentConversionError('ConversionBlockLimitExceeded', report);
    if (block.type === 'paragraph') {
      if (typeof block.displayText !== 'string' || !block.displayText.isWellFormed())
        throw new DocumentConversionError('TextOnlySourceIncomplete', report);
      units += block.displayText.length + (lines.length ? 1 : 0);
      if (units > DOCUMENT_CREATE_LIMITS.maxTextBytes)
        throw new DocumentConversionError('ConversionTextLimitExceeded', report);
      lines.push(block.displayText);
      if (lines.length > DOCUMENT_CREATE_LIMITS.maxParagraphs)
        throw new DocumentConversionError('ConversionParagraphLimitExceeded', report);
      if (block.displayText === '') report.emptyParagraphs++;
    } else if (block.type === 'table') {
      report.flattenedTables++;
      if (!Array.isArray(block.cells))
        throw new DocumentConversionError('InvalidConversionModel', report);
      for (let i = block.cells.length - 1; i >= 0; i--) {
        const cell = block.cells[i];
        if (cell?.contentState !== 'observed' || !Array.isArray(cell.blocks))
          throw new DocumentConversionError('TextOnlySourceIncomplete', report);
        for (let j = cell.blocks.length - 1; j >= 0; j--)
          stack.push({ block: cell.blocks[j], depth: depth + 1 });
      }
    } else {
      const kind = block.type === 'unknown' ? block.kind : block.type;
      if (typeof kind !== 'string')
        throw new DocumentConversionError('InvalidConversionModel', report);
      report.droppedObjectCount++;
    }
  }
  report.bodyParagraphs = lines.length;
  return lines.join('\n');
}

// 표시용 본문 문자열만 새 공통 문서에 이관합니다. 편집 좌표나 전체 의미 변환기가 아닙니다.
export async function convertDocument(
  input: unknown = {},
  dependencies: DocumentConvertDependencies = {},
): Promise<ConvertedDocumentResult> {
  if (!input || typeof input !== 'object') throw new TypeError('InvalidConversionInput');
  const {
    bytes,
    wasm,
    to,
    lossPolicy = 'reject',
    allowStaleLayout = false,
    expectedSha256,
  } = input as Record<string, unknown>;
  if (to !== 'hwp5' && to !== 'hwpx') throw new TypeError('InvalidDocumentFormat');
  if (lossPolicy !== 'reject' && lossPolicy !== 'text-only')
    throw new TypeError('InvalidLossPolicy');
  if (typeof allowStaleLayout !== 'boolean') throw new TypeError('InvalidAllowStaleLayout');
  if (!(wasm instanceof Uint8Array)) throw new TypeError('ExpectedWasmUint8Array');
  if (!wasm.byteLength || wasm.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes)
    throw new RangeError('WasmLimitExceeded');
  if (!(bytes instanceof Uint8Array)) throw new TypeError('ExpectedUint8Array');
  if (expectedSha256 !== undefined && typeof expectedSha256 !== 'string')
    throw new TypeError('InvalidExpectedSha256');
  const binary = Uint8Array.from(wasm);
  const open = dependencies.openDocument ?? openDocument;
  const collect = dependencies.readDocumentModel ?? readDocumentModel;
  const create = dependencies.createDocument ?? createDocument;
  const document = await open({ bytes, wasm: binary, expectedSha256 });
  let source: { format: DocumentFormat; sourceSha256: string } | undefined;
  const report: DocumentConversionReport = {
    lossPolicy,
    lossless: false,
    sourceFormat: null,
    targetFormat: to,
    preserved: '관측된 본문 문단 문자열·순서·빈 문단·Unicode만 보존',
    notPreserved: [...OMITTED],
    tableTraversal: '관측된 셀 순서로 본문을 평탄화하며 표 구조는 보존하지 않음',
    bodyParagraphs: 0,
    emptyParagraphs: 0,
    flattenedTables: 0,
    droppedObjectCount: 0,
    lineBreakPolicy: 'CRLF와 CR은 공통 생성 정책에 따라 LF 문단 경계로 정규화',
  };
  let failed = false,
    failure: unknown;
  let text: string | undefined;
  try {
    const { format: sourceFormat, sourceSha256, sectionCount, sdk } = document;
    source = { format: sourceFormat, sourceSha256 };
    report.sourceFormat = sourceFormat;
    if (!['hwp5', 'hwpx'].includes(sourceFormat))
      throw new DocumentConversionError('InvalidConversionSourceFormat', report);
    if (sourceFormat === to) throw new DocumentConversionError('SameDocumentFormat', report);
    if (lossPolicy === 'reject')
      throw new DocumentConversionError('UnsupportedDocumentConversion', report);
    const model = await collect({
      format: sourceFormat,
      sourceSha256,
      sectionCount,
      sdk,
    });
    if (model?.format !== sourceFormat || model.sourceSha256 !== sourceSha256)
      throw new DocumentConversionError('InvalidConversionModel', report);
    report.sourceInventoryComplete = model.coverage?.inventoryComplete ?? null;
    report.sourceObjectsKnown = model.coverage?.objectsKnown ?? null;
    report.warningCount = Array.isArray(model.warnings) ? model.warnings.length : null;
    report.warningCodes = Array.isArray(model.warnings)
      ? model.warnings.slice(0, 64).map((row) => row.code)
      : [];
    report.warningDetailsOmitted = Math.max(0, (report.warningCount ?? 0) - 64);
    text = bodyText(model, report);
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    await document.close();
  } catch (error) {
    if (failed)
      throw new AggregateError([failure, error], 'DocumentConversionAndCloseFailed', {
        cause: failure,
      });
    throw new Error('DocumentConversionCloseFailed', { cause: error });
  }
  if (failed) throw failure;
  if (!source || text === undefined || lossPolicy !== 'text-only')
    throw new DocumentConversionError('MissingConversionText', report);
  let output: CreatedDocumentResult;
  try {
    output = await create({ format: to, text, wasm: binary, allowStaleLayout });
    if (
      output?.format !== to ||
      !(output.bytes instanceof Uint8Array) ||
      !output.bytes.byteLength ||
      output.bytes.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes ||
      typeof output.layoutRequiresReflow !== 'boolean' ||
      detectDocumentFormat(output.bytes) !== to
    )
      throw new Error('InvalidConvertedDocumentOutput');
  } catch (error) {
    throw new DocumentConversionError(
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : error instanceof Error
          ? error.message
          : 'ConversionCreationFailed',
      report,
      {
        cause: error,
      },
    );
  }
  return {
    ...output,
    sourceFormat: source.format,
    sourceSha256: source.sourceSha256,
    lossPolicy,
    lossless: false,
    report,
  };
}
