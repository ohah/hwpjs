/** One primitive native completion. Cleanup failure never authorizes replay. */
export interface NativeEditOutcome {
  readonly nativeCode?: 0 | 1 | 2 | 3;
  readonly application: 'applied' | 'unapplied' | 'unknown';
  readonly changed: boolean | null;
  readonly error?: string;
  readonly cleanupError?: string;
  readonly refreshRequired?: true;
}
