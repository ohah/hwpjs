/** Portable Core-owned chart transport. The current reference remains opaque. */
export type Hwp5ChartCreateProfile =
  | 'spec24-registered-png-presentation-v1'
  | 'spec24-registered-png-presentation-line-v1'
  | 'spec24-registered-png-presentation-horizontal-bar-v1'
  | 'spec24-registered-png-presentation-pie-v1';
export interface Hwp5ChartCreateOptions {
  readonly profile: Hwp5ChartCreateProfile;
  readonly width: number;
  readonly height: number;
  readonly categories: readonly string[];
  readonly series: readonly { readonly name: string; readonly values: readonly number[] }[];
  readonly preview: { readonly width: number; readonly height: number };
}
export type Hwp5ChartCreateRequest = Hwp5ChartCreateOptions & {
  readonly reference: unknown;
  readonly start: number;
};
