import { isFormOperation, requireFormOperation } from './form-state.ts';
import {
  basicCharacterProperties,
  hasCharacterExtensions,
  requireCharacterExtensions,
} from './character-extensions.ts';
import { requirePageSettingsWrite, admitPageSettings, applyPageSettings } from './page-settings.ts';
import { parseObjectReference } from '../object-reference.ts';
import { hwp5TableCreationRequest } from '../../../../web/preview/hwp5-table-creation-command.mjs';
import type { OperationDocument } from '../types/native-document.ts';
import type {
  CharacterProperties,
  DocumentOperation,
  OperationPosition,
  RangeCondition,
} from './validate.ts';

interface ParagraphReplacementRequest {
  ranges: readonly Pick<RangeCondition, 'section' | 'paragraph' | 'startUnit' | 'endUnit'>[];
  text: string;
  properties?: CharacterProperties;
}
// JS SDK의 선택 필드를 추론 선언이 필수로 표시하므로 경계에서만 undefined를 채웁니다.
// Native에 전달되는 마스크와 값은 기존 SDK codec이 그대로 결정합니다.
function replaceParagraphRanges(
  sdk: OperationDocument['sdk'],
  request: ParagraphReplacementRequest,
): void {
  sdk.replaceParagraphRanges({ ...request, properties: request.properties });
}

const METHODS = Object.freeze({
  'page-settings': 'writePageSettings',
  'form-checkbox-state': 'setCheckBoxState',
  'form-radio-select': 'selectRadioButton',
  'form-text': 'setFormText',
  'source-table-cell-split': 'splitSourceTableCells',
  splice: 'splice',
  'replace-paragraph-ranges': 'replaceParagraphRanges',
  'split-paragraph': 'splitParagraph',
  'merge-paragraph': 'mergeParagraph',
  'character-properties': 'setCharacterProperties',
  'character-format': 'setCharacterFormat',
  'paragraph-bullet-definition': 'writeParagraphBulletDefinition',
  'paragraph-format': 'setParagraphFormat',
  'paragraph-alignment': 'setParagraphAlignment',
  'paragraph-margins': 'setParagraphMargins',
  'paragraph-spacing': 'setParagraphSpacing',
  'cell-sizes': 'setCellSizes',
  'cell-styles': 'setCellStyles',
  'picture-resize': 'resizePicture',
  'table-insert': 'insertTable',
  'created-table-grid': 'editCreatedTableGrid',
} as const);
function requireInitialCellTexts(document: OperationDocument): void {
  const supports: unknown = Reflect.get(document.sdk, 'supportsTableInitialTexts');
  if (typeof supports !== 'function' || Reflect.apply(supports, document.sdk, []) !== true)
    throw new Error('CreatedCellTextUnavailable');
}
interface Target {
  readonly section: number;
  readonly paragraph?: number;
}
function targets(operation: DocumentOperation): readonly Target[] {
  if (operation.kind === 'page-settings')
    return operation.scope === 'section' ? [{ section: operation.section! }] : [];
  if (isFormOperation(operation))
    return [{ section: parseObjectReference(operation.reference).section }];
  if (operation.kind === 'source-table-cell-split')
    return [{ section: parseObjectReference(operation.reference).section }];
  if (operation.kind === 'cell-sizes') return operation.cells;
  if (operation.kind === 'cell-styles') {
    const rows = [
      ...operation.styles.borders,
      ...operation.styles.fills,
      ...(operation.styles.diagonals ?? []),
    ];
    return rows.map((row) => {
      const section: unknown = row.section;
      if (typeof section !== 'number') throw new RangeError('InvalidOperationTarget');
      return { section };
    });
  }
  if (operation.kind === 'replace-paragraph-ranges') return operation.ranges;
  return [operation];
}
export function prepareOperationSession(
  document: OperationDocument,
  operations: readonly DocumentOperation[],
): void {
  if (
    !['hwp5', 'hwpx'].includes(document?.format) ||
    !Number.isInteger(document.sectionCount) ||
    document.sectionCount < 1 ||
    document.sectionCount > 4096 ||
    !document.sdk ||
    typeof document.close !== 'function' ||
    typeof document.save !== 'function'
  )
    throw new Error('InvalidOperationSession');
  const protectedSections = new Set<number>();
  for (const operation of operations) {
    if (isFormOperation(operation)) requireFormOperation(document, operation);
    if (hasCharacterExtensions(operation)) requireCharacterExtensions(document, operation);
    if (operation.kind === 'page-settings') requirePageSettingsWrite(document);
    if (
      operation.kind === 'source-table-cell-split' &&
      (typeof document.sdk.supportsSourceTableCellSplit !== 'function' ||
        !document.sdk.supportsSourceTableCellSplit())
    )
      throw new Error(
        document.format === 'hwp5'
          ? 'Hwp5SourceTableCellSplitAbiUnavailable'
          : 'HwpxSourceTableCellSplitAbiUnavailable',
      );
    if (operation.kind === 'paragraph-bullet-definition') {
      const inventory = document.sdk.paragraphBulletDefinitions();
      if (
        inventory.state !== 'available' ||
        !('definitionWriter' in inventory) ||
        inventory.definitionWriter !== 'character-definitions-v1'
      )
        throw new Error('BulletDefinitionWriteAbiUnavailable');
    }
    if (typeof Reflect.get(document.sdk, METHODS[operation.kind]) !== 'function')
      throw new Error(`DocumentOperationUnavailable:${operation.kind}`);
    if (operation.kind === 'created-table-grid') {
      const supports: unknown = Reflect.get(document.sdk, 'supportsCreatedTableGrid');
      if (typeof supports !== 'function' || Reflect.apply(supports, document.sdk, []) !== true)
        throw new Error(
          document.format === 'hwp5'
            ? 'Hwp5CreatedTableGridAbiUnavailable'
            : 'HwpxCreatedTableGridAbiUnavailable',
        );
    }
    if (operation.kind === 'table-insert' && operation.cellTexts) requireInitialCellTexts(document);
    for (const target of targets(operation)) {
      if (
        target.section >= document.sectionCount ||
        ('paragraph' in target && document.format === 'hwpx' && target.paragraph === 0)
      )
        throw new RangeError('InvalidOperationTarget');
      if (
        document.format === 'hwp5' &&
        ['splice', 'replace-paragraph-ranges', 'split-paragraph', 'merge-paragraph'].includes(
          operation.kind,
        )
      )
        protectedSections.add(target.section);
    }
    const needsText =
      Object.hasOwn(operation, 'expectedText') ||
      Object.hasOwn(operation, 'expectedRangeText') ||
      operation.kind === 'replace-paragraph-ranges';
    if (
      needsText &&
      typeof (document.format === 'hwp5' ? document.sdk.text : document.sdk.anchorText) !==
        'function'
    )
      throw new Error('OperationTextObservationUnavailable');
  }
  if (
    operations.some(
      (operation) =>
        isFormOperation(operation) ||
        hasCharacterExtensions(operation) ||
        operation.kind === 'page-settings' ||
        operation.kind === 'source-table-cell-split' ||
        operation.kind === 'paragraph-bullet-definition',
    )
  ) {
    // These existing Native structural writers require managed history.
    // Enable after synchronous ABI/coordinate checks, before reference capture or mutation.
    document.sdk.enableHistoryV2();
  }
  for (const operation of operations)
    if (operation.kind === 'page-settings') admitPageSettings(document, operation);
  if (document.format === 'hwp5') {
    if (protectedSections.size && typeof document.sdk.validateTextSourcePolicy !== 'function')
      throw new Error('OperationTextSourcePolicyUnavailable');
    for (const section of protectedSections) document.sdk.validateTextSourcePolicy(section);
  }
}
export function applyOperation(document: OperationDocument, operation: DocumentOperation): unknown {
  if (isFormOperation(operation)) throw new Error('PreparedFormStateRequired');
  const textCache = new Map<string, string>();
  let observedUnits = 0;
  const currentText = (row: OperationPosition): string => {
    const key = `${row.section}:${row.paragraph}`;
    const prior = textCache.get(key);
    if (prior !== undefined) return prior;
    const text: unknown =
      document.format === 'hwp5'
        ? document.sdk.text(row.section, row.paragraph)
        : document.sdk.anchorText(row.section, row.paragraph);
    if (typeof text !== 'string' || text.length > 4 * 1024 * 1024 || !text.isWellFormed())
      throw new Error('InvalidOperationTextObservation');
    observedUnits += text.length;
    if (observedUnits > 4 * 1024 * 1024) throw new RangeError('OperationObservationLimitExceeded');
    textCache.set(key, text);
    return text;
  };
  const checkExpected = (
    row: RangeCondition | (OperationPosition & { readonly expectedText?: string }),
  ): void => {
    if ('expectedText' in row && currentText(row) !== row.expectedText)
      throw new Error('OperationTextPreconditionFailed');
    if ('expectedRangeText' in row) {
      const text = currentText(row);
      if (
        row.endUnit > text.length ||
        text.slice(row.startUnit, row.endUnit) !== row.expectedRangeText
      )
        throw new Error('OperationRangePreconditionFailed');
    }
  };
  if (operation.kind === 'replace-paragraph-ranges')
    for (const row of operation.ranges) checkExpected(row);
  else if ('expectedText' in operation || 'expectedRangeText' in operation)
    checkExpected(operation);
  switch (operation.kind) {
    case 'page-settings':
      applyPageSettings(document, operation);
      return null;
    case 'source-table-cell-split':
      throw new Error('PreparedSourceTableSplitRequired');
    case 'splice':
      if (document.format === 'hwp5')
        document.sdk.splice({
          section: operation.section,
          paragraph: operation.paragraph,
          startUnit: operation.startUnit,
          endUnit: operation.endUnit,
          text: operation.text,
        });
      else
        document.sdk.splice(
          operation.section,
          operation.paragraph,
          operation.startUnit,
          operation.endUnit - operation.startUnit,
          operation.text,
        );
      break;
    case 'replace-paragraph-ranges':
      replaceParagraphRanges(document.sdk, {
        ranges: operation.ranges.map(({ section, paragraph, startUnit, endUnit }) => ({
          section,
          paragraph,
          startUnit,
          endUnit,
        })),
        text: operation.text,
        ...(Object.hasOwn(operation, 'properties') ? { properties: operation.properties } : {}),
      });
      break;
    case 'split-paragraph':
      document.sdk.splitParagraph({
        section: operation.section,
        paragraph: operation.paragraph,
        atUnit: operation.atUnit,
        ...(Object.hasOwn(operation, 'endUnit') ? { endUnit: operation.endUnit } : {}),
      });
      break;
    case 'merge-paragraph':
      document.sdk.mergeParagraph({ section: operation.section, paragraph: operation.paragraph });
      break;
    case 'character-properties':
      document.sdk.setCharacterProperties({
        section: operation.section,
        paragraph: operation.paragraph,
        startUnit: operation.startUnit,
        endUnit: operation.endUnit,
        properties: basicCharacterProperties(operation.properties),
      });
      break;
    case 'character-format':
      document.sdk.setCharacterFormat({
        section: operation.section,
        paragraph: operation.paragraph,
        startUnit: operation.startUnit,
        endUnit: operation.endUnit,
        charShapeId: operation.charShapeId,
      });
      break;
    case 'paragraph-bullet-definition':
      document.sdk.writeParagraphBulletDefinition(
        operation.edit,
        operation.section,
        operation.paragraph,
      );
      break;
    case 'paragraph-format':
      document.sdk.setParagraphFormat({
        section: operation.section,
        paragraph: operation.paragraph,
        paraShapeId: operation.paraShapeId,
      });
      break;
    case 'paragraph-alignment':
      document.sdk.setParagraphAlignment({
        section: operation.section,
        paragraph: operation.paragraph,
        alignment: operation.alignment,
      });
      break;
    case 'paragraph-margins':
      document.sdk.setParagraphMargins({
        section: operation.section,
        paragraph: operation.paragraph,
        margins: operation.margins,
      });
      break;
    case 'paragraph-spacing':
      document.sdk.setParagraphSpacing({
        section: operation.section,
        paragraph: operation.paragraph,
        type: operation.type,
        value: operation.value,
      });
      break;
    case 'created-table-grid':
      document.sdk.editCreatedTableGrid({
        section: operation.section,
        identity: operation.identity,
        action: operation.action,
        index: operation.index,
      });
      break;
    case 'cell-sizes':
      document.sdk.setCellSizes(operation.cells);
      break;
    case 'cell-styles':
      document.sdk.setCellStyles(operation.styles);
      break;
    case 'picture-resize':
      document.sdk.resizePicture({
        section: operation.section,
        pictureNode: operation.pictureNode,
        width: operation.width,
        height: operation.height,
      });
      break;
    case 'table-insert': {
      const { section, paragraph, unit, rows, columns, width, rowHeight, resources } = operation;
      const options = {
        rows,
        columns,
        width,
        rowHeight,
        resources,
      };
      if (document.format === 'hwp5') {
        const request = {
          ...hwp5TableCreationRequest({ section, paragraph, unit, options }),
          ...(operation.cellTexts ? { cell_texts: operation.cellTexts } : {}),
        };
        return document.sdk.insertTable(request);
      }
      const initialOptions = {
        ...options,
        ...(operation.cellTexts ? { cellTexts: operation.cellTexts } : {}),
      };
      return document.sdk.insertTable(section, paragraph, unit, initialOptions);
    }
  }
  return null;
}
