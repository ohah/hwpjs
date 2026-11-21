import type { NativeEditOutcome } from './native-edit-outcome.mjs';
export type Hwp5EquationScriptLayout = 'version-only' | 'with-font';
export interface Hwp5EquationScriptCapture {
  readonly section: number;
  readonly equationNode: number;
  readonly layout: Hwp5EquationScriptLayout;
  readonly script: string;
  readonly historyRevision: number;
}
export function checkedHwp5EquationScript(script: unknown): string;
export function clearHwp5EquationScriptCaptures(wasm: object): void;
export function createHwp5EquationScriptEditApi(options: unknown): {
  supportsHwp5EquationScriptEditAbi(): boolean;
  captureHwp5EquationScript(
    section: number,
    equationNode: number,
    layout: Hwp5EquationScriptLayout,
  ): Hwp5EquationScriptCapture;
  /** Local preflight; Core State/token and Native retained lease remain authoritative. */
  isHwp5EquationScriptCurrent(capture: Hwp5EquationScriptCapture): boolean;
  /** Revoke only this active private capture; no edit/history call. */
  discardHwp5EquationScript(capture: Hwp5EquationScriptCapture): boolean;
  editHwp5EquationScript(capture: Hwp5EquationScriptCapture, script: string): NativeEditOutcome;
};
