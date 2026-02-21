import type { NativeModule } from 'craby-modules';
import { NativeModuleRegistry } from 'craby-modules';

export interface ToMarkdownOptions {
  imageOutputDir: string | null;
  image: string | null;
  useHtml: boolean;
  includeVersion: boolean;
  includePageInfo: boolean;
}

export interface ImageData {
  id: string;
  data: ArrayBuffer;
  format: string;
}

export interface ToMarkdownResult {
  markdown: string;
}

export interface ToPdfOptions {
  fontDir: string | null;
  embedImages: boolean;
}

interface Spec extends NativeModule {
  toJson(data: ArrayBuffer): string;
  toMarkdown(data: ArrayBuffer, options: ToMarkdownOptions): ToMarkdownResult;
  toPdf(data: ArrayBuffer, options: ToPdfOptions): ArrayBuffer;
  fileHeader(data: ArrayBuffer): string;
}

export default NativeModuleRegistry.getEnforcing<Spec>('Hwpjs');
