import type { NativeCanvasSurface, NativeTextBoundaries } from './contracts.ts';
// @ts-ignore Platform implementation is shared pure JS, no document model.
import { createHostSurface } from './host-surface.mjs';
// @ts-ignore Explicit Foundation-backed scalar/codec implementation.
import { installNativeTextPlatform as install } from './text-platform.mjs';
// @ts-ignore Native UTF16 range validation.
import { createTextBoundaries } from './text-boundaries.mjs';
export function createNativeCanvasSurface(
  host: unknown,
  callbacks?: { onPoint?: (point: unknown) => void; onError?: (error: Error) => void },
): NativeCanvasSurface {
  return createHostSurface(host, callbacks);
}
export function createNativeTextBoundaries(host: unknown): NativeTextBoundaries {
  return createTextBoundaries(host);
}
export function installNativeTextPlatform(host: unknown): {
  installed: string[];
  segmentationEquivalence: string;
} {
  return install(host);
}
