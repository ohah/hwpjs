import type { Files, OutputReceipt } from '../files.ts';
import type * as engine from '../engine.ts';
import type { renderDocument } from '../render.ts';
import type { inspectDocument } from '../inspect-document.ts';
import type { inspectDocumentObject } from '../document-objects.ts';
import type { createDocumentImages } from '../document-images.ts';
import type { inspectDocumentParagraph } from '../document-paragraph.ts';
import type { ocrDocument } from '../document-ocr.ts';
import type { createDocument } from '../document-create.ts';
import type { convertDocument } from '../document-convert.ts';
import type { replaceDocumentImage } from '../replace-image.ts';
import type { deleteDocumentTable } from '../delete-table.ts';
import type { insertDocumentImage } from '../insert-image.ts';
import type { exportDocumentHTML } from '../export-html.ts';
import type * as operations from '../document-operations.ts';
export interface TextWriter {
  write(text: string): void | Promise<void>;
}
export interface CLIIO {
  stdout: TextWriter;
  stderr: TextWriter;
}
export interface CLIHostDependencies {
  io?: CLIIO;
  files?: Files;
  mainModuleURL?: string;
  engine?: Pick<typeof engine, 'openDocument' | 'read' | 'edit'>;
  renderDocument?: typeof renderDocument;
  inspectDocument?: typeof inspectDocument;
  inspectDocumentObject?: typeof inspectDocumentObject;
  createDocumentImages?: typeof createDocumentImages;
  inspectDocumentParagraph?: typeof inspectDocumentParagraph;
  ocrDocument?: typeof ocrDocument;
  createDocument?: typeof createDocument;
  convertDocument?: typeof convertDocument;
  replaceDocumentImage?: typeof replaceDocumentImage;
  deleteDocumentTable?: typeof deleteDocumentTable;
  insertDocumentImage?: typeof insertDocumentImage;
  exportDocumentHTML?: typeof exportDocumentHTML;
  operationService?: Pick<
    typeof operations,
    'applyDocumentOperations' | 'validateDocumentOperations'
  >;
  creationText?: string;
  imageOutputMode?: 'file';
}
export type RunCLI = (argv: unknown, dependencies?: CLIHostDependencies) => Promise<number>;
export interface ExtendedHostContext {
  files: Files;
  io: CLIIO;
  loadWasm(): Promise<Uint8Array>;
  dependencies?: CLIHostDependencies;
  onPublished(receipt: OutputReceipt): void;
}
