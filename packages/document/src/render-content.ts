import { consumeParagraphAxis } from './model/control-aware-text.ts';
import type {
  DocumentView,
  DocumentBlock,
  TableBlock,
  TableCell,
  PageArea,
  RenderReference,
} from './types/document-view.ts';
interface RenderContext {
  label: string | null;
}
export interface ContentRenderOptions {
  markdown: boolean;
  escape: (value: string) => string;
  line: (text: string) => void;
  references: ReadonlyMap<object, RenderReference>;
  maxOutputUnits: number;
}
// 검증·이스케이프·출력 예산은 render.ts가 소유합니다. 이 모듈은 관측된 내용만 씁니다.
// 표의 좌표 범위가 아닌 관측된 노드 수에 비례하며 정렬이나 병합 셀 복제를 하지 않습니다.
export function simpleCells(
  table: TableBlock,
  allowNested = false,
): { grid: Map<number, TableCell | null>; rows: number; columns: number } | null {
  const { rows, columns, cells } = table;
  if (!rows || !columns) return null;
  const slots = rows * columns;
  if (!Number.isSafeInteger(slots) || slots > 8 * cells.length) return null;
  const grid = new Map<number, TableCell | null>();
  for (const cell of cells) {
    if (
      !cell.geometryKnown ||
      cell.contentState !== 'observed' ||
      cell.row === null ||
      cell.column === null ||
      cell.row >= rows ||
      cell.column >= columns ||
      cell.rowSpan === null ||
      cell.columnSpan === null ||
      cell.row + cell.rowSpan > rows ||
      cell.column + cell.columnSpan > columns ||
      ((cell.rowSpan !== 1 || cell.columnSpan !== 1) && slots > 4096) ||
      (!allowNested &&
        cell.blocks.some((block) => block.type !== 'paragraph' && block.type !== 'image'))
    )
      return null;
    // 병합 격자는 작고 관측 셀 수의 상수배일 때만 구성합니다.
    for (let row = cell.row; row < cell.row + cell.rowSpan; row++) {
      for (let column = cell.column; column < cell.column + cell.columnSpan; column++) {
        const key = row * columns + column;
        if (grid.has(key)) return null;
        grid.set(key, row === cell.row && column === cell.column ? cell : null);
      }
    }
  }
  return grid.size === slots ? { grid, rows, columns } : null;
}

export function renderContent(
  model: DocumentView,
  { markdown, escape, line, references, maxOutputUnits }: ContentRenderOptions,
): void {
  const names = new Map([
    ['image', '이미지'],
    ['table', '표'],
    ['chart', '차트'],
    ['equation', '수식'],
    ['drawing', '도형'],
    ['ole', '임베디드 개체'],
    ['unknown', '알 수 없는 개체'],
  ]);
  const captions = new Map<object, string>();
  let ordinal = 0;
  const caption = (block: DocumentBlock): string | null => {
    const reference = references.get(block);
    if (!reference) return null;
    if (!captions.has(block)) captions.set(block, names.get(reference.kind) + ' ' + ++ordinal);
    const label = captions.get(block);
    return markdown
      ? (reference.kind === 'image' ? '!' : '') + '[' + label + '](' + reference.text + ')'
      : '[' + label + ': ' + reference.text + ']';
  };
  // 한 행을 조립할 때도 예산보다 큰 중간 문자열을 만들지 않습니다.
  const join = (parts: readonly string[], separator: string): string => {
    let units = 0;
    for (let i = 0; i < parts.length; i++) {
      units += parts[i].length + (i ? separator.length : 0);
      if (units > maxOutputUnits) throw new RangeError('RenderOutputLimitExceeded');
    }
    return parts.join(separator);
  };
  // Only an existing verified reference at its exact Native UTF-16 anchor may
  // replace U+FFFC. Equal ordinals in another section never share this index.
  const candidates = new Map<string, Map<number, DocumentBlock | null>>();
  const shown = new Set<DocumentBlock>();
  const ownerKey = (section: number, paragraph: number) => `${section}:${paragraph}`;
  if (model.format === 'hwpx') {
    const stack: DocumentBlock[] = [];
    for (const section of model.sections) {
      for (const block of section.body) stack.push(block);
      for (const area of [section.header, section.footer])
        for (const definition of area.definitions)
          for (const block of definition.blocks) stack.push(block);
    }
    // Unplaced objects never acquire inline placement permission from a matching label.
    while (stack.length) {
      const block = stack.pop()!;
      if (block.type === 'table') {
        for (const cell of block.cells) for (const child of cell.blocks) stack.push(child);
      } else if (block.type === 'unknown' && ['chart', 'equation'].includes(block.kind)) {
        const source = block.source;
        if (
          !source ||
          !Number.isSafeInteger(source.paragraph) ||
          !Number.isSafeInteger(source.anchorUnit) ||
          source.anchorUnit! < 0 ||
          !references.has(block)
        )
          continue;
        const key = ownerKey(source.section, source.paragraph!);
        const slots = candidates.get(key) ?? new Map<number, DocumentBlock | null>();
        const at = source.anchorUnit!;
        slots.set(at, slots.has(at) ? null : block);
        candidates.set(key, slots);
      }
    }
  }
  const paragraphText = (block: Extract<DocumentBlock, { type: 'paragraph' }>): string => {
    const captured =
      model.format === 'hwpx'
        ? consumeParagraphAxis(block)
        : {
            text: block.displayText,
            owner: null,
            allowsAnchor: (_unit: number, _node: number) => false,
          };
    const text = captured.text;
    if (text === null) return '[문단 내용 확인 불가]';
    if (model.format !== 'hwpx') return escape(text);
    const slots = captured.owner
      ? candidates.get(ownerKey(captured.owner.section, captured.owner.paragraph))
      : undefined;
    const parts: string[] = [];
    let last = 0;
    for (const match of text.matchAll(/[\n\t\ufffc]/gu)) {
      const at = match.index;
      parts.push(escape(text.slice(last, at)));
      if (match[0] === '\n') parts.push(markdown ? '<br>' : '\n');
      else if (match[0] === '\t') parts.push(markdown ? '&#9;' : '\t');
      else {
        const object = slots?.get(at);
        const reference = object ? references.get(object) : undefined;
        const label =
          object && reference && captured.allowsAnchor(at, reference.node) && !shown.has(object)
            ? caption(object)
            : null;
        if (label && object) {
          parts.push(label + ' [내용 확인 불가]');
          shown.add(object);
        } else parts.push(match[0]);
      }
      last = at + 1;
    }
    parts.push(escape(text.slice(last)));
    return join(parts, '');
  };
  const inline = (block: DocumentBlock): string => {
    if (block.type === 'paragraph') return paragraphText(block);
    if (block.type !== 'image') throw new TypeError('UnsupportedInlineBlockType');
    const label = caption(block);
    const alt = block.altState === 'provided' && block.alt !== '' ? escape(block.alt) : null;
    return (label ?? '[이미지: 추출 참조 확인 불가]') + (alt ? ' ' + alt : '');
  };
  let previous: string | null = null;
  const emit = (text: string, kind: string, context: RenderContext | null): void => {
    if (text !== '' && context?.label) {
      if (markdown && previous) line('');
      line(context.label);
      if (markdown) line('');
      context.label = null;
      previous = 'label';
    }
    // Markdown 파서가 인접 문단이나 표를 합치지 않도록 블록을 구분합니다.
    if (markdown && previous && previous !== 'label' && kind !== 'table-row') line('');
    if (
      markdown &&
      kind === 'table-row' &&
      previous &&
      previous !== 'table-row' &&
      previous !== 'table-start'
    )
      line('');
    line(text);
    previous = kind;
  };
  const blocks = (values: readonly DocumentBlock[], context: RenderContext | null): void => {
    for (const block of values) {
      if (block.type === 'paragraph' || block.type === 'image') {
        emit(inline(block), 'paragraph', context);
      } else if (block.type === 'unknown') {
        if (shown.has(block)) continue;
        shown.add(block);
        const label = caption(block);
        const name = names.get(block.kind);
        emit(
          label
            ? label + ' [내용 확인 불가]'
            : name
              ? '[' + name + ': 내용·참조 확인 불가]'
              : '[알 수 없는 내용]',
          'paragraph',
          context,
        );
      } else {
        const label = caption(block);
        if (label) emit(label, 'paragraph', context);
        const simple = simpleCells(block);
        if (simple) {
          const { grid, rows, columns } = simple;
          // 빈 헤더는 pipe 표 문법일 뿐 문서의 첫 데이터 행을 제목으로 승격하지 않습니다.
          if (markdown) {
            emit('| ' + Array(columns).fill('').join(' | ') + ' |', 'table-start', context);
            emit('| ' + Array(columns).fill('---').join(' | ') + ' |', 'table-row', context);
          } else if (previous === 'table-row') emit('', 'paragraph', context);
          for (let row = 0; row < rows; row++) {
            const parts = [];
            for (let column = 0; column < columns; column++) {
              const cell = grid.get(row * columns + column)!;
              parts.push(
                cell === null ? '' : join(cell.blocks.map(inline), markdown ? '<br><br>' : ' / '),
              );
            }
            const text = join(parts, markdown ? ' | ' : '\t');
            emit(markdown ? '| ' + text + ' |' : text, 'table-row', context);
          }
        } else {
          emit('[표 배치를 단순화했습니다: 관측된 내용 순서]', 'paragraph', context);
          if (!block.cells.length) emit('[관측된 셀 없음]', 'paragraph', context);
          for (const cell of block.cells) {
            if (cell.contentState !== 'observed') emit('[셀 내용 확인 불가]', 'paragraph', context);
            blocks(cell.blocks, context);
          }
        }
      }
    }
  };
  const area = (value: PageArea, label: string): void => {
    const context = { label };
    if (value.declarations === 'unavailable') emit('[' + label + ' 확인 불가]', 'paragraph', null);
    for (const definition of value.definitions) blocks(definition.blocks, context);
  };
  for (const section of model.sections) {
    area(section.header, '머리말');
    blocks(section.body, null);
    area(section.footer, '꼬리말');
  }
  for (const entry of model.unplaced) {
    emit('[위치를 확인할 수 없는 내용]', 'paragraph', null);
    blocks([entry.block], null);
  }
  // Default content is the actual CLI/MCP response text. Its early return in
  // render.ts must not hide a plain fallback's missing control-aware axis.
  const partialCodes = new Set([
    'ControlAwareOwnerUnverified',
    'ControlAwareTextUnavailable',
    'ControlAwareTextMismatch',
    'InvalidControlAwareText',
    'ControlAwareBatchUnavailable',
  ]);
  type PartialGroup = {
    code: string;
    section: number | null;
    paragraphs: Set<number>;
    min: number;
    max: number;
    representative: number | null;
    unlocated: boolean;
  };
  const groups = new Map<string, PartialGroup>();
  const nativeUint = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  for (const warning of model.warnings) {
    if (!partialCodes.has(warning.code)) continue;
    const source = warning.source;
    const section =
      source && 'section' in source && nativeUint(source.section) ? source.section : null;
    const paragraph =
      source && 'paragraph' in source && nativeUint(source.paragraph) && source.paragraph > 0
        ? source.paragraph
        : null;
    const key = `${warning.code}:${section ?? 'unknown'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        code: warning.code,
        section,
        paragraphs: new Set<number>(),
        min: Infinity,
        max: -Infinity,
        representative: null,
        unlocated: false,
      };
      groups.set(key, group);
    }
    if (paragraph === null) group.unlocated = true;
    else {
      group.paragraphs.add(paragraph);
      group.min = Math.min(group.min, paragraph);
      group.max = Math.max(group.max, paragraph);
      group.representative ??= paragraph;
    }
  }
  for (const group of groups.values()) {
    const place = group.section === null ? ' · 구역 미확인' : ` · 구역 ${group.section}`;
    const affected = group.paragraphs.size
      ? `영향 문단 ${group.paragraphs.size}개 · 관측 번호 범위 ${group.min}–${group.max} · 대표 Native 문단 ${group.representative}` +
        (group.unlocated ? ' · 일부 영향 문단 번호 미확인' : '')
      : '영향 문단 번호 미확인';
    // Preserve plain/site.text as observed content. Do not present it as a
    // Native error, or echo arbitrary SDK messages/private host addresses.
    emit(
      `[부분 읽기: ${escape(group.code)}${place}] 본문 텍스트는 보존해 읽었습니다. 줄바꿈·탭·개체 위치의 완전한 관측은 확인하지 못했습니다. ${affected}.`,
      'paragraph',
      null,
    );
  }
  if (!model.coverage.inventoryComplete || model.warnings.length)
    emit('[일부 내용의 관측이 불완전합니다]', 'paragraph', null);
}
