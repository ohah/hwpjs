import { createHwp5ChartDetailReader } from './hwp5-chart-object-detail.ts';
import { parseObjectReference } from './object-reference.ts';
import { LIMITS, diagnostic } from './model/common.ts';
import type { ChartDisplayData } from '../../../js/hwp5-chart-display-api.mjs';
import type { DocumentView, DocumentBlock } from './types/document-view.ts';

/** Read-only semantic text. Preserve component references and Native edit ownership. */
export function observeHwp5ChartContent(model: DocumentView, sdk: object): void {
  if (model.format !== 'hwp5') return;
  const readDetail = createHwp5ChartDetailReader(sdk);
  const stack: DocumentBlock[] = [];
  for (const row of model.unplaced) stack.push(row.block);
  for (const section of model.sections) {
    for (const block of section.body) stack.push(block);
    for (const area of [section.header, section.footer])
      for (const definition of area.definitions)
        for (const block of definition.blocks) stack.push(block);
  }
  let units = 0;
  while (stack.length) {
    const block = stack.pop()!;
    if (block.type === 'table') {
      for (const cell of block.cells) for (const child of cell.blocks) stack.push(child);
      continue;
    }
    if (
      block.type !== 'unknown' ||
      block.kind !== 'drawing' ||
      block.nativeKind !== 0x246f6c65 ||
      !block.reference
    )
      continue;
    try {
      const target = parseObjectReference(block.reference, {
        format: model.format,
        sourceSha256: model.sourceSha256,
      });
      const result = readDetail(target, block);
      if (result.state !== 'available') continue;
      const text = chartContentText(result.detail.data, LIMITS.maxTextUnits - units);
      // Publish only a complete bounded observation; no partial success text.
      block.hwp5ChartText = text;
      units += text.length;
    } catch (error) {
      model.warnings.push(
        diagnostic(
          'Hwp5ChartContentUnavailable',
          error instanceof Error ? error.message : 'NativeReadFailed',
          block.source,
        ),
      );
    }
  }
}

/** Check each fragment before concatenating/quoting source text, not after stringify. */
function chartContentText(data: ChartDisplayData, budget: number): string {
  const parts: string[] = [];
  let units = 0;
  const put = (text: string) => {
    if (text.length > budget - units) throw Error('ChartContentTextLimitExceeded');
    units += text.length;
    parts.push(text);
  };
  const quoted = (value: unknown) => {
    if (typeof value !== 'string') throw Error('InvalidObjectDetail');
    // Even unescaped text must fit before inspecting its characters.
    if (value.length + 2 > budget - units) throw Error('ChartContentTextLimitExceeded');
    put('"');
    let chunk = '';
    for (const character of value) {
      const encoded = JSON.stringify(character).slice(1, -1);
      if (encoded.length > budget - units) throw Error('ChartContentTextLimitExceeded');
      units += encoded.length;
      chunk += encoded;
      if (chunk.length >= 1024) {
        parts.push(chunk);
        chunk = '';
      }
    }
    if (chunk) parts.push(chunk);
    put('"');
  };
  for (const plot of data.plots) put(`차트 종류: ${plot.kind}\n`);
  for (const row of data.rich_text) {
    put(`차트 텍스트 (${row.owner_role}, complete=${row.plain_text_complete}): `);
    quoted(row.text);
    put('\n');
  }
  for (const row of data.series_text) {
    put(`계열 ${row.series_node}: `);
    quoted(row.text);
    put('\n');
  }
  const bindings = new Map<unknown, Readonly<Record<string, unknown>>>();
  for (const row of data.bindings) {
    if (bindings.has(row.point)) throw Error('InvalidObjectDetail');
    bindings.set(row.point, row);
  }
  let ordinal = 0;
  for (const point of data.points) {
    const binding = bindings.get(ordinal);
    put(
      `값 ${ordinal} (index=${point.index}, kind=${point.kind}, series=${binding?.series_node ?? 'unknown'}, role=${binding?.role ?? 'unclassified'}): `,
    );
    quoted(point.value);
    put('\n');
    ordinal++;
  }
  return parts.join('');
}
