import { createReaderRuntime, copyRuntimeMessage } from '../../web/preview/reader-runtime.mjs';
import { createWorkerReaderDataRuntime } from '../../packages/core/src/internal/worker-reader-data-runtime.ts';
import { createReaderEditorRuntime } from '../../packages/core/src/runtime/reader-runtime.ts';
import { createWorkerEditorRuntime } from '../../packages/core/src/worker-runtime.ts';
import {
  requestAtRuntimeAdmission,
  type RuntimeProjectionPreference,
} from '../../packages/core/src/internal/runtime-admission.ts';
import type { RuntimeMessage, RuntimeRequestContext } from '../../packages/core/src/contracts.ts';
declare const wasmModule: WebAssembly.Module;
declare const message: RuntimeMessage;
declare const context: RuntimeRequestContext;
const preference: RuntimeProjectionPreference = {
  kind: 'history-window-v1',
  operation: 'undo',
  beforeRevision: 1,
  expectedRevision: 0,
  beforeEpoch: '2',
  owner: { section: 0, paragraph: 15, sourceNode: 10, parentNode: null },
};
const backend = createReaderRuntime({ wasmModule });
void backend.request(copyRuntimeMessage(message), () => {}, preference);
void createWorkerReaderDataRuntime({ wasmModule }).request(message, preference);
const reader = createReaderEditorRuntime({ wasmModule });
void reader.request(message, context);
void requestAtRuntimeAdmission(reader, message, context, () => {}, preference);
// @ts-expect-error The projection preference is deliberately not a public request argument.
void reader.request(message, context, preference);
const worker = createWorkerEditorRuntime({ wasmModule });
void worker.request(message, context);
void requestAtRuntimeAdmission(worker, message, context, () => {}, preference);
// @ts-expect-error Public Worker requests retain their original two-argument signature.
void worker.request(message, context, preference);
