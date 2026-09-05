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

// NOTE: toPdf는 아직 지원하지 않으므로 비활성화 (추후 활성화 예정)
// export interface ToPdfOptions {
//   fontDir: string | null;
//   embedImages: boolean;
// }

interface Spec extends NativeModule {
  toJson(data: ArrayBuffer): string;
  toMarkdown(data: ArrayBuffer, options: ToMarkdownOptions): ToMarkdownResult;
  // toPdf(data: ArrayBuffer, options: ToPdfOptions): ArrayBuffer;
  fileHeader(data: ArrayBuffer): string;
}

export default NativeModuleRegistry.getEnforcing<Spec>('Hwpjs');
