import type { DocumentBytes, HTMLConversionOptions } from './types/conversion.js';

export declare function toHtml(
  bytes: DocumentBytes,
  options: HTMLConversionOptions,
): Promise<string>;

export type { DocumentBytes, HTMLConversionOptions } from './types/conversion.js';
