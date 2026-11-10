import type { PrintRasterJob, PrintRasterOptions } from './host-print.mjs';
export function openPrintPreview(
  document: Document,
  capture: (options: PrintRasterOptions<'jpeg'>) => Promise<PrintRasterJob<'jpeg'>>,
  options?: {
    signal?: AbortSignal;
    filename?: string;
    isCurrent?: (token: PrintRasterJob<'jpeg'>['token']) => boolean;
  },
): Readonly<{ close(): void; ready: Promise<boolean> }>;
