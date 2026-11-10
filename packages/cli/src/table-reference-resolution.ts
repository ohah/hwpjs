import { parseObjectReference } from './object-reference.ts';
import type { DocumentFormat } from './types/native-document.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Object.is(value, -0) &&
  value >= 0 &&
  value <= 0xffffffff;
function field(value: unknown, key: string, optional = false): unknown {
  if (!record(value)) throw new TypeError('InvalidTableDeletionModel');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor && optional) return undefined;
  if (!descriptor || !Object.hasOwn(descriptor, 'value'))
    throw new TypeError('InvalidTableDeletionModel');
  return descriptor.value;
}

// 삭제 경로의 기존 오류 이름과 dimensions 비관측 동작을 유지합니다.
// includeDimensions는 선택된 현재 관측의 원값만 노출하며 유효성은 호출자가 검증합니다.
// 관측한 블록만 선형 순회합니다. 기하 기반 행×열 확장이나 원문 편집 모델 생성은 없습니다.
export function resolveTableReference(
  model: unknown,
  reference: string,
  expected: {
    format: DocumentFormat;
    sourceSha256: string;
    sectionCount: number;
  },
  includeDimensions = false,
): { section: number; tableNode: number; expectedRows?: unknown; expectedColumns?: unknown } {
  if (
    field(model, 'version') !== 1 ||
    field(model, 'format') !== expected.format ||
    field(model, 'sourceSha256') !== expected.sourceSha256
  )
    throw new Error('InvalidTableDeletionModel');
  const maximum = 200000;
  let edges = 0;
  function list(value: unknown, visit: (item: unknown) => void) {
    if (!Array.isArray(value)) throw new TypeError('InvalidTableDeletionModel');
    const length: unknown = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!uint(length) || length > maximum - edges)
      throw new RangeError('TableInventoryLimitExceeded');
    edges += length;
    for (let index = 0; index < length; index++) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item || !Object.hasOwn(item, 'value')) throw new TypeError('InvalidTableDeletionModel');
      visit(item.value);
    }
  }
  const stack: { value: unknown; section: number | null; depth: number }[] = [];
  const sections = new Set<number>();
  list(field(model, 'sections'), (section) => {
    const number = field(field(section, 'source'), 'section');
    if (!uint(number) || number >= expected.sectionCount || sections.has(number))
      throw new Error('InvalidTableDeletionModel');
    sections.add(number);
    const enqueue = (value: unknown) => stack.push({ value, section: number, depth: 0 });
    list(field(section, 'body'), enqueue);
    for (const area of ['header', 'footer'])
      list(field(field(section, area), 'definitions'), (definition) =>
        list(field(definition, 'blocks'), enqueue),
      );
  });
  list(field(model, 'unplaced'), (row) =>
    stack.push({ value: field(row, 'block'), section: null, depth: 0 }),
  );
  const visited = new Set<object>(),
    identities = new Set<string>(),
    references = new Set<string>();
  const tables = new Map<string, { section: number; tableNode: number }>();
  let selectedObservation: unknown;
  while (stack.length) {
    const entry = stack.pop()!;
    if (!record(entry.value) || visited.has(entry.value) || entry.depth > 64)
      throw new Error('InvalidTableDeletionModel');
    visited.add(entry.value);
    const id = field(entry.value, 'id'),
      type = field(entry.value, 'type');
    if (
      typeof id !== 'string' ||
      !id ||
      identities.has(id) ||
      typeof type !== 'string' ||
      !['paragraph', 'table', 'image', 'unknown'].includes(type)
    )
      throw new Error('InvalidTableDeletionModel');
    identities.add(id);
    const value = field(entry.value, 'reference', true);
    if (value !== null && value !== undefined) {
      const parsed = parseObjectReference(value, expected);
      const kind = type === 'unknown' ? field(entry.value, 'kind') : type;
      if (
        parsed.kind !== kind ||
        typeof value !== 'string' ||
        references.has(value) ||
        (entry.section !== null && parsed.section !== entry.section) ||
        parsed.section >= expected.sectionCount
      )
        throw new Error('InvalidTableDeletionModel');
      references.add(value);
      if (type === 'table') {
        const source = field(entry.value, 'source');
        const section = field(source, 'section'),
          tableNode = field(source, 'tableNode');
        if (
          !uint(section) ||
          !uint(tableNode) ||
          section !== parsed.section ||
          tableNode !== parsed.node
        )
          throw new Error('InvalidTableDeletionModel');
        tables.set(value, { section, tableNode });
        if (value === reference) selectedObservation = entry.value;
      }
    }
    if (type === 'table')
      list(field(entry.value, 'cells'), (cell) =>
        list(field(cell, 'blocks'), (value) =>
          stack.push({ value, section: entry.section, depth: entry.depth + 1 }),
        ),
      );
  }
  const selected = tables.get(reference);
  if (!selected) throw new Error('TableReferenceNotFound');
  if (includeDimensions)
    return {
      ...selected,
      expectedRows: field(selectedObservation, 'rows', true),
      expectedColumns: field(selectedObservation, 'columns', true),
    };
  return selected;
}
