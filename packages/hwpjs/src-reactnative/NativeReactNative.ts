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
  data: number[];
  format: string;
}

export interface ToMarkdownResult {
  markdown: string;
}

interface Spec extends NativeModule {
  toJson(data: number[]): string;
  toMarkdown(data: number[], options: ToMarkdownOptions): ToMarkdownResult;
  fileHeader(data: number[]): string;
}

export default NativeModuleRegistry.getEnforcing<Spec>('Hwpjs');
