// 검증·이스케이프·출력 예산은 render.mjs가 소유합니다. 이 모듈은 관측된 내용만 씁니다.
// 표의 좌표 범위가 아닌 관측된 노드 수에 비례하며 정렬이나 병합 셀 복제를 하지 않습니다.
function simpleCells(table) {
  const { rows, columns, cells } = table;
  const slots = rows * columns;
  if (!rows || !columns || !Number.isSafeInteger(slots) || slots > 8 * cells.length) return null;
  const grid = new Map();
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
      cell.blocks.some((block) => block.type !== 'paragraph' && block.type !== 'image')
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
  return grid.size === slots ? grid : null;
}

export function renderContent(model, { markdown, escape, line, maxOutputUnits }) {
  // 한 행을 조립할 때도 예산보다 큰 중간 문자열을 만들지 않습니다.
  const join = (parts, separator) => {
    let units = 0;
    for (let i = 0; i < parts.length; i++) {
      units += parts[i].length + (i ? separator.length : 0);
      if (units > maxOutputUnits) throw new RangeError('RenderOutputLimitExceeded');
    }
    return parts.join(separator);
  };
  const inline = (block) => {
    if (block.type === 'paragraph')
      return block.displayText === null ? '[문단 내용 확인 불가]' : escape(block.displayText);
    return block.altState === 'provided' && block.alt !== '' ? escape(block.alt) : '[이미지]';
  };
  let previous = null;
  const emit = (text, kind, context) => {
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
  const blocks = (values, context) => {
    for (const block of values) {
      if (block.type === 'paragraph' || block.type === 'image') {
        emit(inline(block), 'paragraph', context);
      } else if (block.type === 'unknown') {
        emit('[알 수 없는 내용]', 'paragraph', context);
      } else {
        const grid = simpleCells(block);
        if (grid) {
          // 빈 헤더는 pipe 표 문법일 뿐 문서의 첫 데이터 행을 제목으로 승격하지 않습니다.
          if (markdown) {
            emit('| ' + Array(block.columns).fill('').join(' | ') + ' |', 'table-start', context);
            emit('| ' + Array(block.columns).fill('---').join(' | ') + ' |', 'table-row', context);
          } else if (previous === 'table-row') emit('', 'paragraph', context);
          for (let row = 0; row < block.rows; row++) {
            const parts = [];
            for (let column = 0; column < block.columns; column++) {
              const cell = grid.get(row * block.columns + column);
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
  const area = (value, label) => {
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
