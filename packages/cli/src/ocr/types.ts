import type { ObservationSdk } from '../types/document-view.ts';
export type OcrProviderName = 'tesseract' | 'vision';
export type OcrDisplayFormat = 'text' | 'markdown';
export type OcrDocumentFormat = DocumentFormat;
export type OcrLanguage = string & { readonly __ocrLanguage: unique symbol };
export type MaybePromise<T> = T | Promise<T>;

export interface OcrProcessBudget {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  timeoutMs: number;
}

export interface OcrProviderInput {
  languages: OcrLanguage[];
  limits: OcrProcessBudget;
  signal?: AbortSignal;
}
export interface OcrProviderImageInput extends OcrProviderInput {
  bytes: Uint8Array<ArrayBuffer>;
}
export interface OcrProvider {
  id?: OcrProviderName;
  prepare?(input: OcrProviderInput): MaybePromise<unknown>;
  recognize(input: OcrProviderImageInput): MaybePromise<unknown>;
}
export interface PreparedOcrProvider extends OcrProvider {
  prepare(input: OcrProviderInput): MaybePromise<unknown>;
}
export interface OcrProviderText {
  text: string;
}
export interface RecognizedImage {
  status: 'recognized' | 'no-text';
  text: string;
  languages: OcrLanguage[];
}
export interface FailedImage {
  status: 'failed';
  text: '';
  error: string;
}
export type OcrImageResult = (RecognizedImage | FailedImage) & { id: string; reference: string };
export interface DocumentOcrResult {
  schemaVersion: 1;
  format: OcrDocumentFormat;
  sourceSha256: string;
  provider: OcrProviderName;
  languages: OcrLanguage[];
  status: 'complete' | 'partial' | 'failed';
  images: OcrImageResult[];
  text: string;
}

export interface OcrProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
}
export interface OcrProcessRequest {
  executable: string;
  args: string[];
  input?: Uint8Array;
  limits?: OcrProcessBudget;
  signal?: AbortSignal;
}
export type OcrProcessRunner = (options: OcrProcessRequest) => MaybePromise<unknown>;
export interface OcrProviderFactoryOptions {
  provider: OcrProviderName;
  executable?: string;
}
export interface OcrOpenInput {
  bytes: Uint8Array<ArrayBuffer>;
  wasm: Uint8Array<ArrayBuffer>;
  expectedSha256: string;
}
export interface OcrImageFactoryInput {
  sdk: ObservationSdk;
  format: OcrDocumentFormat;
  sourceSha256: string;
  sectionCount: number;
}
export interface OcrDependencies {
  createProvider?: (options: OcrProviderFactoryOptions) => MaybePromise<unknown>;
  openDocument?: (options: OcrOpenInput) => MaybePromise<unknown>;
  createDocumentImages?: (options: OcrImageFactoryInput) => MaybePromise<unknown>;
}
export interface OcrDocumentHandle {
  format: unknown;
  sourceSha256: unknown;
  sectionCount: unknown;
  sdk: ObservationSdk;
  close(): MaybePromise<unknown>;
}
export interface OcrImageCollector {
  list(): MaybePromise<unknown>;
  read(id: string, options: { sourceSha256: string }): MaybePromise<unknown>;
  close(): MaybePromise<unknown>;
}
import type { DocumentFormat } from '../types/native-document.ts';
