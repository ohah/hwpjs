import type { NativeEditOutcome, NativeEditMemory } from './native-edit-outcome.mjs';
import type {
  PictureCropSelector,
  PictureCropRect,
  PictureCropBounds,
  PictureCropObservation,
} from '../packages/core/src/commands/picture-crop.ts';
export type NativePictureCropCapture = PictureCropObservation & Readonly<{ leaseKey: string }>;
export function checkedPictureCropSelector(input: unknown): PictureCropSelector;
export function checkedPictureCropRect(input: unknown, bounds?: PictureCropBounds): PictureCropRect;
export function checkedPictureCropCapture(input: unknown): NativePictureCropCapture;
export function pictureCropObservation(input: unknown): PictureCropObservation;
export const PICTURE_CROP_EDIT_EXPORTS: readonly string[];
export function createPictureCropEditApi(options: {
  wasm: Record<string, unknown>;
  memory: NativeEditMemory & { copy(pointer: number, length: number): Uint8Array };
  check: () => void;
  prefix: string;
}): {
  supportsPictureCropEdit(): boolean;
  capturePictureCrop(selector: PictureCropSelector): NativePictureCropCapture;
  commitPictureCrop(input: { leaseKey: string; crop: PictureCropRect }): NativeEditOutcome;
  releasePictureCrop(leaseKey: string): boolean;
};

export function checkedPictureCropLease(value: unknown): string;
