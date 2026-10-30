import type {
  EditorRuntime,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from '../contracts.ts';
import { canonicalRuntimeDescriptors } from './native-runtime-origin.ts';
export type RuntimeProjectionPreference =
  | boolean
  | Readonly<{
      kind: 'history-window-v1';
      operation: 'undo' | 'redo';
      beforeRevision: number;
      expectedRevision: number;
      beforeEpoch: string;
      owner: Readonly<{
        section: number;
        paragraph: number;
        sourceNode: number;
        parentNode: number | null;
      }>;
    }>;
type Request = (
  message: RuntimeMessage,
  context: RuntimeRequestContext,
  admission: () => void,
  projection?: RuntimeProjectionPreference,
) => Promise<RuntimeReply>;
type Port = { valid: () => boolean; request: Request };
const ports = new WeakMap<object, Port>();
/** Internal pre-dispatch failure only. No Native request has started. */
export class RuntimeAdmissionRejected extends Error {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error));
    this.name = 'RuntimeAdmissionRejected';
  }
}
/** Builtin adapter registration; not a Native owner/ref issuer and never a public export. */
export function bindRuntimeAdmission(
  runtime: EditorRuntime,
  request: Request,
  transportValid: () => boolean,
): void {
  const originalRequest = runtime.request,
    originalDispose = runtime.dispose;
  let tainted = false;
  const valid = () => {
    if (!canonicalRuntimeDescriptors(runtime, originalRequest, originalDispose, Object.prototype))
      tainted = true;
    return !tainted && transportValid();
  };
  ports.set(runtime, { valid, request });
}
export function hasRuntimeAdmission(runtime: EditorRuntime | undefined): boolean {
  try {
    return !!runtime && ports.get(runtime)?.valid() === true;
  } catch {
    return false;
  }
}
export function requestAtRuntimeAdmission(
  runtime: EditorRuntime,
  message: RuntimeMessage,
  context: RuntimeRequestContext,
  guard: () => void,
  projection: RuntimeProjectionPreference = false,
): Promise<RuntimeReply> {
  const port = ports.get(runtime);
  const admission = () => {
    try {
      if (!port?.valid()) throw Error('UnsupportedAtomicRuntime');
      guard();
    } catch (error) {
      throw new RuntimeAdmissionRejected(error);
    }
  };
  admission();
  return port!.request(message, context, admission, projection);
}
