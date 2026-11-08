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
  const inline = (block: DocumentBlock): string => {
    if (block.type === 'paragraph')
      return block.displayText === null ? '[문단 내용 확인 불가]' : escape(block.displayText);
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
  if (!model.coverage.inventoryComplete || model.warnings.length)
    emit('[일부 내용의 관측이 불완전합니다]', 'paragraph', null);
}
