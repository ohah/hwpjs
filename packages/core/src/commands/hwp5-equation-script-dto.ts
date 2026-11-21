/** Package-contained public types. No facade or Native witness type is exported. */
export type Hwp5EquationScriptLayout = 'version-only' | 'with-font';
export interface Hwp5EquationScriptSelector {
  readonly section: number;
  readonly equationNode: number;
  readonly layout: Hwp5EquationScriptLayout;
}
declare const hwp5EquationScriptTarget: unique symbol;
export interface Hwp5EquationScriptTarget {
  readonly [hwp5EquationScriptTarget]: true;
}
export interface EditHwp5EquationScriptPayload {
  readonly target: Hwp5EquationScriptTarget;
  readonly script: string;
}
export interface Hwp5EquationScriptSource {
  readonly section: number;
  readonly equationNode: number;
  readonly paragraph: number;
  readonly unit: number;
  readonly issue: string | null;
}
export type Hwp5EquationScriptRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: Hwp5EquationScriptTarget;
      selector: Hwp5EquationScriptSelector;
      script: string;
      historyRevision: number;
    }>;
