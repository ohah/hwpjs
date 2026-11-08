import { characterPropertyArgs } from '../../../../js/character-property-args.mjs';
import { paragraphMarginArgs } from '../../../../js/paragraph-margin-args.mjs';
import { paragraphSpacingArgs } from '../../../../js/paragraph-spacing-args.mjs';
import { encodeCellSizes } from '../../../../js/cell-size-batch.mjs';
import { validateCellStyles } from '../../../../js/cell-style-command.mjs';
import { encodeCharacterRanges } from '../../../../js/character-range-batch.mjs';
import { encodeParagraphReplacement } from '../../../../js/paragraph-replacement.mjs';

export interface OperationPosition {
  readonly section: number;
  readonly paragraph: number;
}
export interface RangeCondition extends OperationPosition {
  readonly startUnit: number;
  readonly endUnit: number;
  readonly expectedRangeText: string;
}
export interface CharacterProperties {
  readonly size?: number | null;
  readonly bold?: boolean | null;
  readonly italic?: boolean | null;
}
export interface ParagraphMargins {
  readonly left?: number | null;
  readonly right?: number | null;
  readonly indent?: number | null;
  readonly before?: number | null;
  readonly after?: number | null;
}
export interface CellSize {
  readonly section: number;
  readonly listNode: number;
  readonly width: number;
  readonly height: number;
}
export interface TableResources {
  readonly paragraph: number;
  readonly character: number;
  readonly style: number;
  readonly border_fill: number;
}
export type CellStyles = ReturnType<typeof validateCellStyles>;
interface OperationBase {
  readonly coordinates: 'current-transaction';
}
interface WholeTextCondition {
  readonly expectedText?: string;
}
type AtParagraph = OperationPosition & WholeTextCondition;
export type DocumentOperation = OperationBase &
  (
    | ({ readonly kind: 'splice'; readonly text: string } & RangeCondition & WholeTextCondition)
    | {
        readonly kind: 'replace-paragraph-ranges';
        readonly ranges: readonly RangeCondition[];
        readonly text: string;
        readonly properties?: CharacterProperties;
      }
    | ({
        readonly kind: 'split-paragraph';
        readonly atUnit: number;
        readonly endUnit?: number;
        readonly expectedText: string;
      } & OperationPosition)
    | ({ readonly kind: 'merge-paragraph'; readonly expectedText: string } & OperationPosition)
    | ({
        readonly kind: 'character-properties';
        readonly properties: CharacterProperties;
      } & RangeCondition &
        WholeTextCondition)
    | ({ readonly kind: 'character-format'; readonly charShapeId: number } & RangeCondition &
        WholeTextCondition)
    | ({ readonly kind: 'paragraph-format'; readonly paraShapeId: number } & AtParagraph)
    | ({ readonly kind: 'paragraph-alignment'; readonly alignment: string } & AtParagraph)
    | ({ readonly kind: 'paragraph-margins'; readonly margins: ParagraphMargins } & AtParagraph)
    | ({
        readonly kind: 'paragraph-spacing';
        readonly type: string;
        readonly value: number;
      } & AtParagraph)
    | { readonly kind: 'cell-sizes'; readonly cells: readonly CellSize[] }
    | { readonly kind: 'cell-styles'; readonly styles: CellStyles }
    | {
        readonly kind: 'picture-resize';
        readonly section: number;
        readonly pictureNode: number;
        readonly width: number;
        readonly height: number;
      }
    | ({
        readonly kind: 'table-insert';
        readonly unit: number;
        readonly rows: number;
        readonly columns: number;
        readonly width: number;
        readonly rowHeight: number;
        readonly resources: TableResources;
      } & AtParagraph)
  );
export type DocumentOperationKind = DocumentOperation['kind'];
export interface OperationFieldSpec {
  readonly required: readonly string[];
  readonly optional: readonly string[];
}
interface CaptureBudget {
  nodes: number;
  units: number;
  bytes: number;
}

const MAX_OPERATIONS = 256;
const MAX_NODES = 100000;
const MAX_UNITS = 4 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const encoder = new TextEncoder();

const common = ['kind', 'coordinates'];
const paragraph = [...common, 'section', 'paragraph'];
const textRange = [...paragraph, 'startUnit', 'endUnit', 'expectedRangeText'];
const spec = (required: readonly string[], optional: readonly string[] = []): OperationFieldSpec =>
  Object.freeze({ required: Object.freeze(required), optional: Object.freeze(optional) });
// CLI와 MCP가 공유하는 필수 및 선택 키의 단일 출처입니다.
export const DOCUMENT_OPERATION_SPECS = Object.freeze({
  splice: spec([...textRange, 'text'], ['expectedText']),
  'replace-paragraph-ranges': spec([...common, 'ranges', 'text'], ['properties']),
  'split-paragraph': spec([...paragraph, 'atUnit', 'expectedText'], ['endUnit']),
  'merge-paragraph': spec([...paragraph, 'expectedText']),
  'character-properties': spec([...textRange, 'properties'], ['expectedText']),
  'character-format': spec([...textRange, 'charShapeId'], ['expectedText']),
  'paragraph-format': spec([...paragraph, 'paraShapeId'], ['expectedText']),
  'paragraph-alignment': spec([...paragraph, 'alignment'], ['expectedText']),
  'paragraph-margins': spec([...paragraph, 'margins'], ['expectedText']),
  'paragraph-spacing': spec([...paragraph, 'type', 'value'], ['expectedText']),
  'cell-sizes': spec([...common, 'cells']),
  'cell-styles': spec([...common, 'styles']),
  'picture-resize': spec([...common, 'section', 'pictureNode', 'width', 'height']),
  'table-insert': spec(
    [...paragraph, 'unit', 'rows', 'columns', 'width', 'rowHeight', 'resources'],
    ['expectedText'],
  ),
});

// 비동기 열기 전에 요청을 소유합니다. getter 재조회와 순환 및 숨은 필드를 허용하지 않습니다.
function capture(
  value: unknown,
  budget: CaptureBudget,
  active: Set<object> = new Set(),
  depth = 0,
): unknown {
  if (++budget.nodes > MAX_NODES || depth > 16) throw new RangeError('OperationInputLimitExceeded');
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new TypeError('InvalidOperationUnicode');
    budget.units += value.length;
    if (value.length > MAX_UNITS || budget.units > MAX_UNITS)
      throw new RangeError('OperationInputLimitExceeded');
    budget.bytes += encoder.encode(value).byteLength;
    if (budget.bytes > MAX_UNITS) throw new RangeError('OperationInputLimitExceeded');
    return value;
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (typeof value !== 'object' || value === null || active.has(value))
    throw new TypeError('InvalidOperationData');
  const isArray = Array.isArray(value);
  if (!isArray && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError('InvalidOperationData');
  active.add(value);
  const outputArray: unknown[] = [];
  const outputRecord: Record<string, unknown> = Object.create(null);
  const output = isArray ? outputArray : outputRecord;
  const names = Reflect.ownKeys(value);
  if (names.length > MAX_NODES || (isArray && value.length > MAX_NODES))
    throw new RangeError('OperationInputLimitExceeded');
  for (const name of names) {
    if (isArray && name === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (
      typeof name !== 'string' ||
      !descriptor?.enumerable ||
      !('value' in descriptor) ||
      (isArray && !/^(0|[1-9]\d*)$/u.test(name))
    )
      throw new TypeError('InvalidOperationData');
    if (isArray && Number(name) >= value.length) throw new TypeError('InvalidOperationData');
    Object.defineProperty(output, name, {
      value: capture(descriptor.value, budget, active, depth + 1),
      enumerable: true,
    });
  }
  if (isArray && outputArray.length !== value.length) throw new TypeError('InvalidOperationData');
  if (isArray)
    for (let i = 0; i < value.length; i++)
      if (!Object.hasOwn(output, i)) throw new TypeError('InvalidOperationData');
  active.delete(value);
  return Object.freeze(output);
}

function fields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (
    !record(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new TypeError('InvalidOperationFields');
}
function uint(value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    Object.is(value, -0) ||
    value < 0 ||
    value > 0xffffffff
  )
    throw new RangeError('InvalidOperationInteger');
}
function string(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new TypeError('InvalidOperationText');
}
function position(
  operation: Record<string, unknown>,
): asserts operation is Record<string, unknown> & OperationPosition {
  uint(operation.section);
  uint(operation.paragraph);
}
function range(
  operation: Record<string, unknown>,
): asserts operation is Record<string, unknown> & RangeCondition {
  position(operation);
  uint(operation.startUnit);
  uint(operation.endUnit);
  string(operation.expectedRangeText);
  if (
    operation.endUnit < operation.startUnit ||
    operation.expectedRangeText.length !== operation.endUnit - operation.startUnit
  )
    throw new RangeError('InvalidOperationRange');
}

export function validateDocumentOperations(input: unknown): readonly DocumentOperation[] {
  if (!Array.isArray(input) || input.length > MAX_OPERATIONS)
    throw new RangeError('OperationCountLimitExceeded');
  const captured = capture(input, { nodes: 0, units: 0, bytes: 0 });
  if (!Array.isArray(captured)) throw new TypeError('InvalidOperationData');
  const operations: readonly unknown[] = captured;
  for (const operation of operations) {
    if (!record(operation) || typeof operation.kind !== 'string')
      throw new TypeError('InvalidOperationKind');
    if (operation.coordinates !== 'current-transaction')
      throw new TypeError('OperationCoordinatesRequired');
    if (!Object.hasOwn(DOCUMENT_OPERATION_SPECS, operation.kind))
      throw new Error(`UnsupportedDocumentOperation:${operation.kind}`);
    const shape = DOCUMENT_OPERATION_SPECS[operation.kind as DocumentOperationKind];
    fields(operation, shape.required, shape.optional);
    switch (operation.kind) {
      case 'splice':
        range(operation);
        string(operation.text);
        if (/[\r\n]/u.test(operation.text))
          throw new Error('UseParagraphRangeReplacementForNewlines');
        break;
      case 'replace-paragraph-ranges': {
        if (
          !Array.isArray(operation.ranges) ||
          operation.ranges.length < 1 ||
          operation.ranges.length > 4096
        )
          throw new RangeError('InvalidOperationRanges');
        for (const row of operation.ranges as readonly unknown[]) {
          fields(row, ['section', 'paragraph', 'startUnit', 'endUnit', 'expectedRangeText']);
          range(row);
        }
        encodeCharacterRanges(
          (operation.ranges as readonly RangeCondition[]).map(
            ({ section, paragraph, startUnit, endUnit }) => ({
              section,
              paragraph,
              startUnit,
              endUnit,
            }),
          ),
        );
        encodeParagraphReplacement(operation.text);
        if (Object.hasOwn(operation, 'properties')) characterPropertyArgs(operation.properties);
        break;
      }
      case 'split-paragraph':
        position(operation);
        uint(operation.atUnit);
        string(operation.expectedText);
        if (Object.hasOwn(operation, 'endUnit')) {
          uint(operation.endUnit);
          if (operation.endUnit < operation.atUnit) throw new RangeError('InvalidOperationRange');
        }
        break;
      case 'merge-paragraph':
        position(operation);
        string(operation.expectedText);
        break;
      case 'character-properties':
        range(operation);
        characterPropertyArgs(operation.properties);
        break;
      case 'character-format':
        range(operation);
        uint(operation.charShapeId);
        break;
      case 'paragraph-format':
        position(operation);
        uint(operation.paraShapeId);
        break;
      case 'paragraph-alignment':
        position(operation);
        if (
          typeof operation.alignment !== 'string' ||
          !['LEFT', 'RIGHT', 'CENTER', 'JUSTIFY', 'DISTRIBUTE', 'DISTRIBUTE_SPACE'].includes(
            operation.alignment,
          )
        )
          throw new TypeError('InvalidParagraphAlignment');
        break;
      case 'paragraph-margins':
        position(operation);
        paragraphMarginArgs(operation.margins);
        break;
      case 'paragraph-spacing':
        position(operation);
        paragraphSpacingArgs(operation.type, operation.value);
        break;
      case 'cell-sizes':
        encodeCellSizes(operation.cells);
        break;
      case 'cell-styles':
        validateCellStyles(operation.styles);
        break;
      case 'picture-resize':
        for (const key of ['section', 'pictureNode', 'width', 'height']) uint(operation[key]);
        if (!operation.width || !operation.height) throw new RangeError('InvalidResizeAxisSize');
        break;
      case 'table-insert':
        position(operation);
        uint(operation.unit);
        uint(operation.rows);
        uint(operation.columns);
        uint(operation.width);
        uint(operation.rowHeight);
        if (
          !operation.rows ||
          !operation.columns ||
          !operation.width ||
          !operation.rowHeight ||
          operation.rows * operation.columns > 4096
        )
          throw new RangeError('InvalidOperationTableSize');
        fields(operation.resources, ['paragraph', 'character', 'style', 'border_fill']);
        for (const value of Object.values(operation.resources)) uint(value);
        break;
      default:
        throw new Error(`UnsupportedDocumentOperation:${operation.kind}`);
    }
    if (Object.hasOwn(operation, 'expectedText')) string(operation.expectedText);
  }
  // 위 분기에서 모든 필수 값과 기존 Native 요청 codec 검사를 마친 소유 스냅샷입니다.
  return operations as readonly DocumentOperation[];
}
