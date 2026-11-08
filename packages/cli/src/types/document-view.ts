import type { DocumentFormat, Hwp5Sdk, HwpxSdk } from './native-document.ts';
import type { decodeCharacterRanges } from '../../../../js/character-shapes-wire.mjs';
import type { decodeTableBindings } from '../../../../js/table-bindings-wire.mjs';
import type { decodeTablePlacements } from '../../../../js/table-placements-wire.mjs';

export type ReadFormat = 'text' | 'markdown';
export type ReadView = 'content' | 'structure';
export type ObjectKind = 'image' | 'table' | 'chart' | 'equation' | 'drawing' | 'ole' | 'unknown';
type CommonObservationMethods =
  | 'paragraphFlow'
  | 'tableBindings'
  | 'tablePlacements'
  | 'paragraphShapeId'
  | 'characterRanges';
type Hwp5ObservationMethods =
  | CommonObservationMethods
  | 'currentTextPreview'
  | 'paragraphCount'
  | 'text'
  | 'tableLayoutSources'
  | 'cellLayoutSources'
  | 'pageAreaSources'
  | 'tableAnchors'
  | 'drawingSources'
  | 'drawingAnchors'
  | 'pictureSources'
  | 'drawingComponentSources'
  | 'binaryResource'
  | 'fileVersion'
  | 'textSourceProtection'
  | 'supportsTextSourceProtection';
type HwpxObservationMethods =
  | CommonObservationMethods
  | 'paragraphTextSnapshot'
  | 'anchorText'
  | 'tableBorderSources'
  | 'pageAreaDeclarations'
  | 'pictureSites'
  | 'pictureOwners'
  | 'chartSites'
  | 'equationSites'
  | 'oleSites'
  | 'rectangleNodes'
  | 'lineNodes'
  | 'connectorNodes'
  | 'ellipseSources'
  | 'drawingTextBindings'
  | 'pictureBytes'
  | 'chartDisplay'
  | 'equationScript'
  | 'oleSource';
export type ObservationSdk = Readonly<
  Partial<Pick<Hwp5Sdk, Hwp5ObservationMethods>> | Partial<Pick<HwpxSdk, HwpxObservationMethods>>
>;
export interface DocumentReadContext {
  format: DocumentFormat;
  sourceSha256: string;
  sectionCount: number;
  sdk: ObservationSdk;
}
export interface Diagnostic {
  code: string;
  message: string;
  source?: Readonly<Record<string, unknown>> | SourceLocation | ImageSource;
}
export interface SourceLocation {
  section: number;
  paragraph?: number;
  node?: number;
  anchorUnit?: number;
}
export interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  displayText: string | null;
  source: SourceLocation & { paragraph: number };
  editability: 'range-check-required' | 'read-only' | 'unknown';
  reason?: string;
  reference?: null;
}
export interface TableCell {
  id: string;
  source?: SourceLocation & { tableNode: number; listNode: number; cellNode?: number };
  row: number | null;
  column: number | null;
  rowSpan: number | null;
  columnSpan: number | null;
  geometryKnown: boolean;
  contentState: string;
  blocks: DocumentBlock[];
}
export interface TableBlock {
  id: string;
  type: 'table';
  reference?: string | null;
  source?: SourceLocation & { tableNode: number };
  rows: number | null;
  columns: number | null;
  cells: TableCell[];
}
export interface ImageSource {
  section?: number | null;
  pictureNode?: number | null;
  recordNode?: number | null;
  componentNode?: number | null;
  ownerNode?: number | null;
  resourceId?: number | null;
}
interface ImageBase {
  id: string;
  type: 'image';
  reference?: string | null;
  imageId?: string | null;
  label?: string;
  sourceInfo: ImageSource;
  width?: number | null;
  height?: number | null;
  sizeUnit?: string;
}
export type ImageBlock = ImageBase &
  (
    | { altState: 'provided'; alt: string }
    | { altState: 'not-provided' | 'not-exposed'; alt: string | null }
  );
export interface UnknownBlock {
  id: string;
  type: 'unknown';
  kind: string;
  reference?: string | null;
  diagnostic: Diagnostic;
  source?: SourceLocation;
  editability?: 'unknown';
  detailUnavailable?: boolean;
  nativeKind?: number;
  subtype?: string;
}
export type DocumentBlock = ParagraphBlock | TableBlock | ImageBlock | UnknownBlock;
export interface PageAreaDefinition {
  id: string;
  kind: 'header' | 'footer';
  source?: SourceLocation & {
    ownerNode: number;
    listNode: number;
    declarationParagraph?: number;
    declarationUnit?: number;
  };
  apply: 'both' | 'odd' | 'even' | null;
  range: { state: 'observed' | 'unresolved'; from?: number; to?: number };
  blocks: DocumentBlock[];
  observedParagraphs?: number;
  declaredParagraphs?: number;
}
export interface PageArea {
  declarations: 'known' | 'unavailable';
  definitions: PageAreaDefinition[];
  inheritance: {
    state: 'observed' | 'unresolved' | 'not-applicable';
    fromSection?: number;
    definitionId?: string;
  };
}
export interface DocumentSection {
  id: string;
  source: { section: number };
  header: PageArea;
  body: DocumentBlock[];
  footer: PageArea;
}
export interface DocumentCoverage {
  inventoryComplete: boolean;
  paragraphTotal?: number | null;
  observedParagraphs?: number;
  placed?: number;
  unplaced?: number;
  unknownBlocks?: number;
  unreadableSections?: number;
  pageAreasKnown?: boolean;
  imagesKnown?: boolean;
  pageAreaInheritanceKnown?: boolean;
  tablesWithCompleteCellInventory?: number;
  objectsKnown?: boolean;
  objectInventoryComplete?: boolean;
  objectInventoryScope?: string;
  objectTotal?: number;
  objectsPlaced?: number;
  objectsUnplaced?: number;
}
export interface DocumentView {
  version: 1;
  format: DocumentFormat;
  sourceSha256: string;
  coordinates?: {
    sectionBase: 0;
    paragraphBase: 0 | 1;
    paragraphScope: 'section' | 'document';
    textUnit: string;
  };
  sections: DocumentSection[];
  unplaced: { block: DocumentBlock; diagnostic: Diagnostic }[];
  warnings: Diagnostic[];
  coverage: DocumentCoverage;
}
export interface ModelLimits {
  maxDepth: number;
  maxBlocks: number;
  maxTextUnits: number;
}
export interface RenderLimits {
  maxDepth: number;
  maxNodes: number;
  maxTextUnits: number;
  maxOutputUnits: number;
}
export interface RenderOptions extends Partial<RenderLimits> {
  format: ReadFormat;
  view?: ReadView;
}
export interface ObjectReference {
  sourceSha256: string;
  format: DocumentFormat;
  section: number;
  kind: ObjectKind;
  node: number;
}
export type RenderReference = ObjectReference & { text: string };
export interface ReadResult {
  format: DocumentFormat;
  sourceSha256: string;
  text: string;
}
export interface Observation<T = unknown> {
  ok: boolean;
  value: T | null;
}

// 기존 코덱의 반환 경계를 사용하며 JSON 기반 코덱의 읽기 필드만 명세합니다.
export type CharacterRange = ReturnType<typeof decodeCharacterRanges>[number];
export type TableBinding = ReturnType<typeof decodeTableBindings>[number] & {
  paragraph: number;
  tableNode: number;
  listNode: number;
  rows: number;
  columns: number;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
};
export type TablePlacement = ReturnType<typeof decodeTablePlacements>[number];
export interface ParagraphFlow {
  paragraph: number;
  source_node?: number | null;
  parent_node?: number | null;
  list_node?: number | null;
  generated?: boolean;
  host?: string;
  top_level?: boolean;
  page_area?: { owner_node: number; list_node: number; apply?: string | null } | null;
}
export interface PreviewParagraph {
  nodeIndex?: number | null;
  text?: string;
  textPresent?: boolean;
  declaredUnits?: number;
  tokens?: { type: string; code?: number; startUnit?: number }[];
}
export interface PreviewSection {
  index: number;
  paragraphs: PreviewParagraph[];
}
export interface NativeDrawing {
  component_node: number;
  control_node: number;
  owner_node: number;
  kind_id: number;
  paragraph: number;
  current_unit: number;
  width: number;
  height: number;
}
export interface NativePicture {
  component_node: number;
  picture_node: number;
  owner_node: number;
  bin_data_id: number;
}
export interface TableLayout {
  table_record_node: number;
  rows: number;
  columns: number;
}
export interface CellLayout {
  table_record_node: number;
  list_node: number;
}
export interface CellInventory {
  cells: { table_node: number; list_node: number; cell_node?: number }[];
}
export interface PageAreaObservation {
  kind?: string;
  owner_node?: number;
  list_node?: number;
  control_attributes?: number;
  paragraph_count?: number;
  sourceElement?: number;
  paragraph?: number;
  unit?: number;
}
export interface ParagraphObservation {
  paragraph: number;
  node: number | null;
  identityKnown: boolean;
  displayText: string | null;
  flow: ParagraphFlow | null;
}
export interface PictureObservation {
  inventorySiteKnown: boolean;
  pictureNode: number;
  parentParagraph: number | null;
  sourceInfo: ImageSource;
  width?: number | null;
  height?: number | null;
  reason: string | null;
}
export interface ObjectObservation {
  kind: ObjectKind;
  node: number | null;
  siteKnown?: boolean;
  parentParagraph?: number | null;
  parentObjectNode?: number | null;
  nativeKind?: number;
  paragraph?: number;
  anchorUnit?: number;
  reason?: string;
  detailUnavailable?: boolean;
  subtype?: string;
}
export interface SectionObservation {
  section: number;
  format: DocumentFormat;
  paragraphs: ParagraphObservation[];
  paragraphTotal: number | null;
  flowsKnown: boolean;
  bindings: Observation<TableBinding[]>;
  placements: Observation<TablePlacement[]>;
  tableInventory: Observation<TableLayout[] | CellInventory>;
  cellInventory: Observation<CellLayout[]> | null;
  areas: Observation<PageAreaObservation[]>;
  anchors?: Observation<unknown>;
  pictures: PictureObservation[];
  picturesKnown: boolean;
  objects: ObjectObservation[];
  objectsKnown: boolean;
  objectInventoryScope: string;
}
export interface DocumentObservations {
  sections: SectionObservation[];
  warnings: Diagnostic[];
}
