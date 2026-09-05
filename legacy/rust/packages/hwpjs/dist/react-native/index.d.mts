import { NativeModule } from "craby-modules";

//#region src-reactnative/NativeReactNative.d.ts
interface ToMarkdownOptions {
  imageOutputDir: string | null;
  image: string | null;
  useHtml: boolean;
  includeVersion: boolean;
  includePageInfo: boolean;
}
interface ToMarkdownResult {
  markdown: string;
}
interface Spec extends NativeModule {
  toJson(data: ArrayBuffer): string;
  toMarkdown(data: ArrayBuffer, options: ToMarkdownOptions): ToMarkdownResult;
  fileHeader(data: ArrayBuffer): string;
}
declare const _default: Spec;
//#endregion
export { _default as Hwpjs };
//# sourceMappingURL=index.d.mts.map