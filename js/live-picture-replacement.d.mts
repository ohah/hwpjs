import type {
  PictureReplacementOwner,
  PictureReplacementSelector,
} from '../packages/core/src/commands/picture-replacement-dto.ts';
import type { NativeEditOutcome } from '../packages/core/src/contracts/native-edit-outcome.ts';

export function checkedPictureReplacementSelector(value: unknown): PictureReplacementSelector;
export function checkedPictureReplacementOwner(value: unknown): PictureReplacementOwner;
export function copyPictureReplacementImage(value: unknown): Uint8Array;
interface MemoryPort {
  withBytes<T>(bytes: Uint8Array, action: (ptr: number, size: number) => T): T;
  error(): Error;
}
export interface LivePictureReplacementApi {
  supportsPictureReplacement(): boolean;
  pictureReplacementOwner(selector: PictureReplacementSelector): PictureReplacementOwner;
  replacePicture(owner: PictureReplacementOwner, imageBytes: Uint8Array): NativeEditOutcome;
}
export function createLivePictureReplacementApi(options: {
  format: 'hwp5' | 'hwpx';
  wasm: Record<string, unknown>;
  memory: MemoryPort;
  check(): void;
  output(action: () => number): { bytes: Uint8Array };
}): LivePictureReplacementApi;
