const MAX_INPUT_BYTES = 64 * 1024 * 1024;

/** 단일·배치 읽기가 공유하는 스냅샷 → 기존 엔진 → 기존 표시 경로입니다.
 * 파일 호스트만 주입하며 새 파서·편집 모델·Native 수명 관리자를 만들지 않습니다.
 */
export async function readDocumentOperation(
  { inputPath, inputSnapshot, wasm, format = 'text' },
  { files, engine, renderDocument, loadWasm },
) {
  if (!['text', 'markdown'].includes(format)) throw Error('InvalidReadFormat');
  const input =
    inputSnapshot ?? (await files.readInputSnapshot(inputPath, { maxBytes: MAX_INPUT_BYTES }));
  if (
    !(input?.bytes instanceof Uint8Array) ||
    input.bytes.length < 1 ||
    input.bytes.length > MAX_INPUT_BYTES ||
    typeof input.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.sha256 ?? '')
  )
    throw Error('InvalidInputSnapshot');
  const binary = wasm ?? (await loadWasm());
  const result = await engine.read({ bytes: input.bytes, wasm: binary });
  if (!['hwp5', 'hwpx'].includes(result?.format)) throw Error('InvalidEngineFormat');
  if (
    result.model?.version !== 1 ||
    result.model.format !== result.format ||
    result.model.sourceSha256 !== input.sha256
  )
    throw Error('InvalidEngineModel');
  const text = await renderDocument(result.model, { format });
  if (typeof text !== 'string' || !text.isWellFormed()) throw Error('InvalidRenderedDocument');
  return { format: result.format, sourceSha256: input.sha256, text };
}

const scalar = (value) =>
  Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? '\\u' + code.toString(16).padStart(4, '0') : character;
  }).join('');

/** 내부 배치 모델은 문서 JSON으로 노출하지 않고 읽기용 텍스트/Markdown으로 보고합니다. */
export function renderBatchReadReport(batch, { format = 'text', maxOutputBytes }) {
  if (!['text', 'markdown'].includes(format)) throw Error('InvalidReadFormat');
  const indent = format === 'markdown' ? '    ' : '';
  const lines = [format === 'markdown' ? '# 여러 문서 읽기\n' : '여러 문서 읽기\n'];
  const line = (key, value) => `${indent}${key}: ${scalar(value)}\n`;
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
  const text = lines.join('');
  if (!text.isWellFormed() || new TextEncoder().encode(text).byteLength > maxOutputBytes)
    throw Error('ReadManyReportBudgetExceeded');
  return text;
}
