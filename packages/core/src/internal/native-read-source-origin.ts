import { validDocumentTextReadStamp } from '../../../../js/document-text-read-stamp.mjs';
import type { RuntimeReply, RuntimeRequestContext, EditorRuntime } from '../contracts.ts';
import type { NativeModuleContract } from './native-runtime-origin.ts';
import { copyOwned, freezeDTO } from '../state/owned.ts';
export type NativeReadBinding = Readonly<{
  schemaVersion: 1;
  scope: 'native-document-text-read-binding';
  executionAuthority: false;
  format: 'hwp5' | 'hwpx';
  session: string;
  epoch: string;
  serial: string;
}>;
export interface NativeReadSourceOrigin {
  readonly kind: string;
  readonly binding: NativeReadBinding;
  readonly context: RuntimeRequestContext;
  readonly sourceContext: object;
  readonly publicationSequence: number;
  readonly authority: () => boolean;
}
export function ownNativeReadBinding(input: unknown): NativeReadBinding | undefined {
  const b = copyOwned(input) as NativeReadBinding;
  if (
    !b ||
    typeof b !== 'object' ||
    Object.keys(b).length !== 7 ||
    b.schemaVersion !== 1 ||
    b.scope !== 'native-document-text-read-binding' ||
    b.executionAuthority !== false ||
    !['hwp5', 'hwpx'].includes(b.format) ||
    typeof b.session !== 'string' ||
    !b.session ||
    b.session.length > 256 ||
    !validDocumentTextReadStamp({ epoch: b.epoch, serial: b.serial })
  )
    return;
  return freezeDTO(b);
}
/** Built-in Runtime only. Module qualification and context are independent from
 * the Native-owned read fields. Nothing here issues History or geometry rights. */
export function nativeReadSourceOrigin(
  reply: RuntimeReply,
  context: RuntimeRequestContext | undefined,
  publicationSequence: number,
  contract: NativeModuleContract | undefined,
  sourceContext: object,
  authority: () => boolean,
): NativeReadSourceOrigin | undefined {
  if (!contract || !context || !authority() || reply.error) return;
  const binding = ownNativeReadBinding(reply.documentTextReadBinding);
  if (!binding) return;
  return Object.freeze({
    kind: reply.kind,
    binding,
    context: Object.freeze({ ...context }),
    sourceContext,
    publicationSequence,
    authority,
  });
}
const runtimes = new WeakMap<
  object,
  (reply: RuntimeReply, ctx: RuntimeRequestContext) => NativeReadSourceOrigin | undefined
>();
export function bindNativeReadSourceRuntime(
  runtime: EditorRuntime,
  read: (reply: RuntimeReply, ctx: RuntimeRequestContext) => NativeReadSourceOrigin | undefined,
) {
  runtimes.set(runtime, read);
}
export function consumeNativeReadSourceOrigin(
  runtime: EditorRuntime,
  reply: RuntimeReply,
  ctx: RuntimeRequestContext,
) {
  return runtimes.get(runtime)?.(reply, ctx);
}
