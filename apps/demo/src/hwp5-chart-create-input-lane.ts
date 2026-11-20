import type { ChartCreateOptions } from '../../../packages/core/src/commands/inline-object-insert.ts';
import { checkedChartCreateOptions } from '../../../js/hwpx-inline-object-insert.mjs';

/** The caller retains the SDK-issued owner and fresh caret; this lane never
 * reconstructs, serializes or grants Native edit authority. */
export interface Hwp5ChartInputCapture {
  current(): boolean;
}
export interface ChartRasterPixels {
  readonly width: number;
  readonly height: number;
}
export interface ChartRasterPayload {
  readonly schemaVersion: 1;
  readonly scope: 'hwp5-chart-create-preview-payload';
  readonly executionAuthority: false;
  readonly source_xml_sha256: readonly number[];
  readonly rendering: 'hwpjs-preview-approximation';
  readonly warnings: readonly string[];
  readonly pixel_width: number;
  readonly pixel_height: number;
  readonly mime: 'image/png';
  readonly bytes: Uint8Array;
}
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

/** UI preparation only. The final preview/create SDK method shape is owned by
 * the Native/SDK lane and is deliberately not guessed here. */
export function createHwp5ChartCreateInputLane<Capture extends Hwp5ChartInputCapture>(options: {
  preview(draft: ChartCreateOptions, capture: Capture): Promise<Uint8Array>;
  render(
    wire: Uint8Array,
    pixels: ChartRasterPixels,
    current: () => boolean,
  ): Promise<ChartRasterPayload>;
}) {
  let disposed = false,
    busy = false,
    epoch = 0;
  const used = new WeakSet<Capture>();
  type Prepared = Readonly<{
    capture: Capture;
    options: ChartCreateOptions;
    preview: ChartRasterPayload;
    epoch: number;
  }>;
  const prepared = new WeakSet<Prepared>();
  const live = (capture: Capture, ticket: number) =>
    !disposed && ticket === epoch && capture.current() === true;
  return {
    async prepare(
      capture: Capture,
      input: ChartCreateOptions,
      pixels: ChartRasterPixels,
    ): Promise<Prepared> {
      if (disposed || busy || used.has(capture) || capture.current() !== true)
        throw Error('StaleChartCreateInput');
      const draft = freeze(checkedChartCreateOptions(input) as ChartCreateOptions);
      // Read explicit dimensions before yielding. Pixel policy belongs to the
      // existing converter and eventual SDK capability, never an arbitrary clamp.
      const size = Object.freeze({ width: pixels.width, height: pixels.height });
      if (capture.current() !== true) throw Error('StaleChartCreateInput');
      used.add(capture);
      busy = true;
      const ticket = ++epoch;
      try {
        const wire = await options.preview(draft, capture);
        if (!live(capture, ticket)) throw Error('StaleChartCreateInput');
        const payload = await options.render(wire, size, () => live(capture, ticket));
        if (!live(capture, ticket)) throw Error('StaleChartCreateInput');
        const value = Object.freeze({ capture, options: draft, preview: payload, epoch: ticket });
        prepared.add(value);
        return value;
      } finally {
        busy = false;
      }
    },
    current(value: Prepared) {
      return prepared.has(value) && live(value.capture, value.epoch);
    },
    take(value: Prepared) {
      if (!prepared.has(value) || !live(value.capture, value.epoch))
        throw Error('StaleChartCreateInput');
      prepared.delete(value);
      // The final SDK command must generate its own fresh raster.
      // Do not hand the UI preview PNG to a writer or ABI request.
      return Object.freeze({ capture: value.capture, options: value.options });
    },
    invalidate() {
      ++epoch;
    },
    dispose() {
      disposed = true;
      ++epoch;
    },
  };
}
