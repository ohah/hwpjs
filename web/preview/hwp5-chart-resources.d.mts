/** Current display membership only; grants no Native edit or geometry authority. */
export interface CurrentHwp5ChartTarget {
  readonly kind: 'hwp5-chart';
  readonly section: number;
  readonly controlNode: number;
  readonly historyRevision: number;
  readonly sourceEpoch: string;
}
export interface Hwp5ChartResourceEntry {
  readonly value?: unknown;
  readonly previewValue?: unknown;
  readonly error?: string | null;
  readonly provisional?: boolean;
  readonly pending?: Promise<void> | null;
  readonly units?: number;
}
export interface Hwp5ChartResources {
  get(section: number, controlNode: number): Hwp5ChartResourceEntry | null;
  status(section: number, controlNode: number): Hwp5ChartResourceEntry | null;
  refresh(
    targets?: Iterable<{
      readonly section: number;
      readonly controlNode: number;
      readonly error_name?: unknown;
    }> | null,
    previewKeys?: ReadonlySet<string>,
  ): void;
  load(section: number, controlNode: number): Promise<void>;
  clear(): void;
  close(): void;
}
export function hwp5ChartKey(section: number, controlNode: number): string;
export function sameHwp5ChartOwner(a: unknown, b: unknown): boolean;
export function hwp5ChartDisplayMatchesTarget(value: unknown, target: unknown): boolean;
export function createHwp5ChartResources(options: {
  read(section: number, controlNode: number): Promise<unknown>;
  current(): unknown;
  onChange?(section: number, controlNode: number): void;
}): Hwp5ChartResources;
export function compatibleHwp5ChartPreviewKeys(
  content: unknown,
  resources: Pick<Hwp5ChartResources, 'get'>,
): Set<string>;
export function readHwp5ChartPaintResource(
  resources: Pick<Hwp5ChartResources, 'status'>,
  target: { readonly section: number; readonly controlNode: number },
): Hwp5ChartResourceEntry | null;
export function currentHwp5ChartTarget(
  content: unknown,
  target: unknown,
): CurrentHwp5ChartTarget | null;
