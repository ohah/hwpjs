import type { ReadResult, ReadFormat, ReadView } from './types/document-view.ts';
import type { BatchReadResult } from './batch-read.ts';
export interface ReadOperationDependencies {
  files: {
    readInputSnapshot(path: string, options: { maxBytes: number }): unknown | Promise<unknown>;
  };
  engine: { read(input: { bytes: Uint8Array; wasm: Uint8Array }): unknown | Promise<unknown> };
  renderDocument(
    model: unknown,
    options: { format: ReadFormat; view: ReadView },
  ): unknown | Promise<unknown>;
  loadWasm(): Uint8Array | Promise<Uint8Array>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
import { createDisplayEscaper } from './render-escape.ts';

const MAX_INPUT_BYTES = 64 * 1024 * 1024;

/** 단일·배치 읽기가 공유하는 스냅샷 → 기존 엔진 → 기존 표시 경로입니다.
 * 파일 호스트만 주입하며 새 파서·편집 모델·Native 수명 관리자를 만들지 않습니다.
 */
export async function readDocumentOperation(
  options: unknown,
  { files, engine, renderDocument, loadWasm }: ReadOperationDependencies,
): Promise<ReadResult> {
  if (!record(options)) throw Error('InvalidReadFormat');
  const { inputPath, inputSnapshot, wasm, format = 'text', view = 'content' } = options;
  if (format !== 'text' && format !== 'markdown') throw Error('InvalidReadFormat');
  if (view !== 'content' && view !== 'structure') throw Error('InvalidReadView');
  const loadSnapshot = async (): Promise<unknown> => {
    if (typeof inputPath !== 'string') throw Error('InvalidInputPath');
    return files.readInputSnapshot(inputPath, { maxBytes: MAX_INPUT_BYTES });
  };
  const input = inputSnapshot ?? (await loadSnapshot());
  if (
    !record(input) ||
    !(input.bytes instanceof Uint8Array) ||
    input.bytes.length < 1 ||
    input.bytes.length > MAX_INPUT_BYTES ||
    typeof input.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.sha256 ?? '')
  )
    throw Error('InvalidInputSnapshot');
  const binary = wasm ?? (await loadWasm());
  if (!(binary instanceof Uint8Array)) throw Error('InvalidWasmBytes');
  const result = await engine.read({ bytes: input.bytes, wasm: binary });
  if (!record(result) || (result.format !== 'hwp5' && result.format !== 'hwpx'))
    throw Error('InvalidEngineFormat');
  if (
    !record(result.model) ||
    result.model.version !== 1 ||
    result.model.format !== result.format ||
    result.model.sourceSha256 !== input.sha256
  )
    throw Error('InvalidEngineModel');
  const text = await renderDocument(result.model, { format, view });
  if (typeof text !== 'string' || !text.isWellFormed()) throw Error('InvalidRenderedDocument');
  return { format: result.format, sourceSha256: input.sha256, text };
}

/** CLI와 웹 실습이 공유하는 단일 읽기 응답입니다. 원문으로 대체하지 않습니다. */
export function renderReadResponse(result: unknown, options: unknown = {}): string {
  if (!record(options)) throw Error('InvalidReadView');
  const { view = 'content' } = options;
  if (!record(result)) throw Error('InvalidReadResult');
  const { format, sourceSha256, text } = result;
  if (format !== 'hwp5' && format !== 'hwpx') throw Error('InvalidEngineFormat');
  if (typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256))
    throw Error('InvalidReadSourceSHA256');
  if (view !== 'content' && view !== 'structure') throw Error('InvalidReadView');
  if (typeof text !== 'string' || !text.isWellFormed()) throw Error('InvalidRenderedDocument');
  if (view === 'content') return text;
  return `format: ${format}\ndocumentSHA256: ${sourceSha256}\n${text}${text.endsWith('\n') ? '' : '\n'}`;
}

const metadataEscape = createDisplayEscaper({ format: 'text', view: 'structure' });
const scalar = (value: unknown) => metadataEscape(String(value));

/** 내부 배치 모델은 문서 JSON으로 노출하지 않고 읽기용 텍스트/Markdown으로 보고합니다. */
export function renderBatchReadReport(
  batch: BatchReadResult,
  {
    format = 'text',
    view = 'content',
    maxOutputBytes,
  }: { format?: ReadFormat; view?: ReadView; maxOutputBytes: number },
): string {
  if (format !== 'text' && format !== 'markdown') throw Error('InvalidReadFormat');
  if (view !== 'content' && view !== 'structure') throw Error('InvalidReadView');
  const indent = format === 'markdown' ? '    ' : '';
  const lines = [format === 'markdown' ? '# 여러 문서 읽기\n' : '여러 문서 읽기\n'];
  const line = (key: string, value: unknown) => `${indent}${key}: ${scalar(value)}\n`;
  if (view === 'content') {
    const escape = createDisplayEscaper({ format, view });
    for (const row of batch.results) {
      const label = escape(row.inputPath);
      lines.push(
        format === 'markdown'
          ? `\n## ${row.index + 1}. ${label}\n`
          : `\n[${row.index + 1}] ${label}\n`,
      );
      if (row.value) lines.push(row.value.text, row.value.text.endsWith('\n') ? '' : '\n');
      for (const error of row.errors) {
        const detail = error.detail === undefined ? '' : ` (${escape(error.detail)})`;
        lines.push(`읽기 실패: ${escape(error.message)}${detail}\n`);
      }
      if (row.status === 'failure' && row.errors.length === 0)
        lines.push('읽기 실패: 문서 결과를 제공하지 못했습니다.\n');
    }
    lines.push(`\n읽기 결과: 성공 ${batch.summary.succeeded}개, 실패 ${batch.summary.failed}개\n`);
    return checkedReport(lines, maxOutputBytes);
  }
  lines.push(
    line('batchStatus', batch.status),
    line('requested', batch.summary.total),
    line('succeeded', batch.summary.succeeded),
    line('failed', batch.summary.failed),
  );
  for (const row of batch.results) {
    lines.push(format === 'markdown' ? `\n## 문서 ${row.index + 1}\n` : `\n[${row.index + 1}]\n`);
    lines.push(
      line('inputPath', row.inputPath),
      line('status', row.status),
      line('readStatus', row.readStatus),
      line('outputStatus', row.outputStatus),
      line('deliveryStatus', row.deliveryStatus),
    );
    if (row.value) {
      lines.push(
        line('format', row.value.format),
        line('documentSHA256', row.value.sourceSha256),
        '\n',
        row.value.text,
        row.value.text.endsWith('\n') ? '' : '\n',
      );
    }
    for (const error of row.errors) {
      lines.push(line('error', error.code), line('message', error.message));
      if (error.detail !== undefined) lines.push(line('detail', error.detail));
    }
  }
  return checkedReport(lines, maxOutputBytes);
}

function checkedReport(lines: readonly string[], maxOutputBytes: number): string {
  const text = lines.join('');
  if (!text.isWellFormed() || new TextEncoder().encode(text).byteLength > maxOutputBytes)
    throw Error('ReadManyReportBudgetExceeded');
  return text;
}
