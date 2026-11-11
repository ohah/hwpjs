import type { CharacterFontLanguage, SelectionFormatting } from '@hwpjs/core';
/** UI boundary only: the app bridges these intents to PUBLIC editor/host APIs.
 * No snapshot is a command target. The bridge must capture/revalidate the core
 * selection token at dispatch, including pending composition and revision gates.
 */
export type DemoFramework = 'headless' | 'vanilla' | 'react' | 'svelte';
export type DemoCommand =
  | 'new-document'
  | 'save'
  | 'print-preview'
  | 'insert-document'
  | 'block-selection'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'find'
  | 'replace'
  | 'format-copy'
  | 'insert-shape'
  | 'insert-image'
  | 'insert-table'
  | 'generated-table-insert-row'
  | 'generated-table-delete-row'
  | 'generated-table-insert-column'
  | 'generated-table-delete-column'
  | 'table-cell-properties'
  | 'table-cell-appearance'
  | 'table-cell-background'
  | 'table-cell-border'
  | 'insert-chart'
  | 'insert-footnote'
  | 'insert-endnote'
  | 'insert-link'
  | 'insert-symbol'
  | 'character-properties'
  | 'paragraph-properties'
  | 'object-properties'
  | 'insert-header'
  | 'insert-footer'
  | 'toggle-marks'
  | 'toggle-grid'
  | 'insert-comment'
  | 'word-count'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'text-color'
  | 'font-name'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-justify'
  | 'align-distribute'
  | 'align-distribute-space'
  | 'toggle-paragraph-marks'
  | 'set-font-size'
  | 'set-zoom'
  | 'zoom-in'
  | 'zoom-out';
export type DemoAction =
  | { readonly command: Exclude<DemoCommand, 'set-font-size' | 'set-zoom' | 'font-name'> }
  | { readonly command: 'font-name'; readonly language?: CharacterFontLanguage | 'representative' }
  | { readonly command: 'set-font-size'; readonly points: number }
  | { readonly command: 'set-zoom'; readonly percent: number };
export interface ActionAvailability {
  readonly enabled: boolean;
  /** 표시용 선택 근거만. 실행 시 소유 Surface가 현재 범위를 다시 검증한다. */
  readonly surfaceSelection?: boolean;
  /** Required explanation when unavailable; the shell supplies a fallback. */
  readonly reason?: string;
  readonly pressed?: boolean | 'mixed';
}
/** A presentation projection supplied by the app, not a second editor state. */
export interface DemoShellState {
  readonly title: string;
  readonly status: string;
  readonly busy?: boolean;
  readonly documentLabel?: string;
  readonly pageLabel?: string;
  readonly selectionLabel?: string;
  readonly fontNames?: SelectionFormatting['fontNames'];
  readonly fontName?: string;
  readonly fontNameTitle?: string;
  readonly fontNameLanguage?: 'hangul';
  readonly fontSizePoints?: number;
  readonly fontSizeStatus?: 'single' | 'mixed' | 'unknown' | 'unavailable';
  readonly fontSizeHint?: string;
  readonly styleLabel?: string;
  readonly zoomPercent?: number;
  readonly actions?: Readonly<Partial<Record<DemoCommand, ActionAvailability>>>;
  readonly openFile?: ActionAvailability;
  readonly openFixture?: ActionAvailability;
}
/** Use the existing allowlisted catalog. Do not inject filesystem paths/URLs. */
export interface DemoFixture {
  readonly id: string;
  readonly name: string;
  readonly label?: string;
  /** File availability only; omitted preserves existing caller behavior. */
  readonly available?: boolean;
}
/** Trace is pre-redacted by the bridge. Never stringify editor payloads/passwords. */
export interface DemoTraceEntry {
  readonly event: string;
  readonly detail: string;
}
export interface DemoShellOptions {
  readonly framework: DemoFramework;
  /** Actual routes are owned by the app entry/build/server integrator. */
  readonly routes: Readonly<Record<DemoFramework, string>>;
  readonly fixtures: readonly DemoFixture[];
  readonly getState: () => DemoShellState;
  readonly onAction?: (action: DemoAction) => void | Promise<void>;
  readonly onOpenFile?: (file: File) => void | Promise<void>;
  readonly onOpenFixture?: (fixtureId: string) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
}
