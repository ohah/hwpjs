import type { Hwp5Sdk, HwpxSdk } from '../../../document/src/types/native.ts';
export type { DocumentFormat, Hwp5Sdk, HwpxSdk } from '../../../document/src/types/native.ts';

export type NativeEditor = { format: 'hwp5'; sdk: Hwp5Sdk } | { format: 'hwpx'; sdk: HwpxSdk };

export interface DocumentOpenOptions {
  bytes: Uint8Array;
  wasm: Uint8Array;
  expectedSha256?: string;
}
export interface TextTarget {
  section: number;
  paragraph: number;
}
export interface ReplaceTextInput {
  target: unknown;
  oldText: unknown;
  newText: unknown;
}
export interface ReplaceTextResult extends TextTarget {
  changed: boolean;
  startUnit: number;
  endUnit: number;
}
export interface SaveOptions {
  allowStaleLayout?: boolean;
}
export interface Hwp5SaveResult {
  bytes: Uint8Array;
  layoutRequiresReflow: boolean;
}
interface DocumentBase {
  sourceSha256: string;
  sectionCount: number;
  replaceText: (input: ReplaceTextInput) => ReplaceTextResult;
  close: () => void;
}
export type Hwp5OpenedDocument = DocumentBase & {
  format: 'hwp5';
  sdk: Hwp5Sdk;
  save: (options?: SaveOptions) => Hwp5SaveResult;
};
export type HwpxOpenedDocument = DocumentBase & {
  format: 'hwpx';
  sdk: HwpxSdk;
  save: (options?: SaveOptions) => Uint8Array;
};
export type OpenedDocument = Hwp5OpenedDocument | HwpxOpenedDocument;

type SharedMutationMethods =
  | 'splice'
  | 'replaceParagraphRanges'
  | 'splitParagraph'
  | 'mergeParagraph'
  | 'setCharacterProperties'
  | 'setCharacterFormat'
  | 'setParagraphFormat'
  | 'setParagraphAlignment'
  | 'setParagraphMargins'
  | 'setParagraphSpacing'
  | 'setCellSizes'
  | 'setCellStyles'
  | 'resizePicture'
  | 'insertTable'
  | 'editCreatedTableGrid'
  | 'supportsCreatedTableGrid'
  | 'enableHistoryV2'
  | 'supportsSourceTableCellSplit'
  | 'sourceTableCellSplitCapabilities'
  | 'sourceTableCellSplitBinding'
  | 'splitSourceTableCells'
  | 'tableBindings'
  | 'tablePlacements'
  | 'paragraphFlow';
type Hwp5MutationSdk = Pick<
  Hwp5Sdk,
  | SharedMutationMethods
  | 'text'
  | 'validateTextSourcePolicy'
  | 'writeParagraphBulletDefinition'
  | 'paragraphBulletDefinitions'
>;
type HwpxMutationSdk = Pick<
  HwpxSdk,
  | SharedMutationMethods
  | 'anchorText'
  | 'writeParagraphBulletDefinition'
  | 'paragraphBulletDefinitions'
  | 'enableHistoryV2'
>;
interface OperationDocumentBase {
  sourceSha256: string;
  sectionCount: number;
  // Native 경계의 저장 응답은 서비스의 런타임 검증 후에만 바이트로 인정합니다.
  save: (options: SaveOptions) => unknown | Promise<unknown>;
  close: () => void | Promise<void>;
}
export type OperationDocument = OperationDocumentBase &
  ({ format: 'hwp5'; sdk: Hwp5MutationSdk } | { format: 'hwpx'; sdk: HwpxMutationSdk });
export interface OperationDependencies {
  openDocument?: (input: DocumentOpenOptions) => Promise<OperationDocument>;
}
