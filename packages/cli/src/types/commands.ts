import type { DocumentFormat, TextTarget } from './native-document.ts';
import type { ReadFormat, ReadView } from './document-view.ts';
export type { DocumentFormat } from './native-document.ts';
export type { ReadFormat, ReadView } from './document-view.ts';
export type NativeTarget = Readonly<TextTarget>;
interface WasmOption {
  readonly wasm?: string;
}
interface InputOption extends WasmOption {
  readonly input: string;
  readonly expectSha256?: string;
}
interface NewOutput {
  readonly output: string;
  readonly allowStaleLayout: boolean;
}
export type ExtendedCommandName =
  | 'apply'
  | 'create'
  | 'convert'
  | 'ocr'
  | 'paragraph'
  | 'delete-table'
  | 'insert-image'
  | 'export-html'
  | 'replace-image';
export type ExtendedCommandOptions =
  | (InputOption &
      NewOutput & {
        readonly command: 'delete-table';
        readonly reference: string;
      })
  | (InputOption &
      NewOutput & {
        readonly command: 'insert-image';
        readonly expectSha256: string;
        readonly target: NativeTarget;
        readonly unit: number;
        readonly expectedText: string;
        readonly imagePath: string;
        readonly width: number;
        readonly height: number;
      })
  | (InputOption & {
      readonly command: 'export-html';
      readonly output: string;
      readonly embedImages: 'supported' | 'none';
    })
  | (WasmOption & {
      readonly command: 'replace-image';
      readonly input: string;
      readonly output: string;
      readonly reference: string;
      readonly imagePath: string;
    })
  | (InputOption &
      NewOutput & {
        readonly command: 'apply';
        readonly expectSha256: string;
        readonly patch?: string;
        readonly inlineOperations?: string;
      })
  | (WasmOption &
      NewOutput & {
        readonly command: 'create';
        readonly format: DocumentFormat;
        readonly textFile?: string;
      })
  | (InputOption &
      NewOutput & {
        readonly command: 'convert';
        readonly to: DocumentFormat;
        readonly lossPolicy: 'reject' | 'text-only';
      })
  | (InputOption & {
      readonly command: 'ocr';
      readonly format: ReadFormat;
      readonly provider: 'tesseract' | 'vision';
      readonly languages: string;
      readonly executable?: string;
      readonly reference?: string;
    })
  | (InputOption & {
      readonly command: 'paragraph';
      readonly format: ReadFormat;
      readonly target: NativeTarget;
    });
export type CLIOptions =
  | ExtendedCommandOptions
  | { readonly command: 'help' }
  | (InputOption & {
      readonly command: 'read';
      readonly format: ReadFormat;
      readonly view: ReadView;
    })
  | (WasmOption & {
      readonly command: 'read-many';
      readonly inputPaths: readonly string[];
      readonly format: ReadFormat;
      readonly view: ReadView;
      readonly concurrency: number;
      readonly maxOutputBytes: number;
    })
  | (InputOption &
      NewOutput & {
        readonly command: 'edit';
        readonly expectSha256: string;
        readonly target: NativeTarget;
        readonly replace: string;
        readonly with: string;
      })
  | (InputOption & ({ readonly command: 'info' } | { readonly command: 'images' }))
  | (InputOption & {
      readonly command: 'extract-images';
      readonly output: string;
      readonly id?: string;
      readonly reference?: string;
    })
  | (InputOption & {
      readonly command: 'object';
      readonly expectSha256: string;
      readonly reference: string;
      readonly format: ReadFormat;
    });
