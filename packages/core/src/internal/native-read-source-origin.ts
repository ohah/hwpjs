import { surfaceOperation } from '../commands/surface-protocol.ts';
import { sameRequestContext } from './native-runtime-origin.ts';
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

/** Private adapter lifecycle. A wire binding is descriptive, never its own issuer.
 * The caller must authenticate the module and (for Worker) the reply transport. */
export function createNativeReadSourceLifecycle(
  contract: () => NativeModuleContract | undefined,
  valid: () => boolean,
) {
  const replies = new WeakMap<object, NativeReadSourceOrigin>();
  let fence: object = Object.freeze({});
  let scope: object | undefined;
  let last: NativeReadSourceOrigin | undefined;
  let retired: NativeReadSourceOrigin | undefined;
  let recoverable: NativeReadSourceOrigin | undefined;
  let retiredRequest: RuntimeRequestContext | undefined;
  let recoverableRequest: RuntimeRequestContext | undefined;
  const revoke = () => {
    scope = undefined;
    last = retired = recoverable = undefined;
    retiredRequest = recoverableRequest = undefined;
    fence = Object.freeze({});
  };
  return {
    begin(kind: string, context?: RuntimeRequestContext): object {
      if (surfaceOperation(kind) !== 'read' && kind !== 'save') {
        const previous = scope && last?.authority() ? last : undefined;
        revoke();
        if (surfaceOperation(kind) === 'mutation') {
          retired = previous;
          retiredRequest = context ? { ...context } : undefined;
        }
      }
      return fence;
    },
    publish(
      ticket: object,
      reply: RuntimeReply,
      context: RuntimeRequestContext | undefined,
      sequence: number,
      trusted: boolean,
    ): void {
      if (ticket !== fence) return;
      if (reply.content !== undefined) scope = undefined;
      if (!trusted || !valid()) return;
      if (surfaceOperation(reply.kind) === 'mutation') {
        const unchanged =
          reply.meta?.application === 'unapplied' ||
          (!reply.error && (reply.meta?.changed === false || reply.changed === false));
        recoverable =
          unchanged && retiredRequest && sameRequestContext(retiredRequest, context)
            ? retired
            : undefined;
        recoverableRequest = recoverable ? retiredRequest : undefined;
        retired = undefined;
        retiredRequest = undefined;
      }
      // A qualified unchanged reply plus a fresh exact Native binding may renew
      // the current Core observation. The retired scope itself never revives.
      if (!scope && reply.kind === 'document-text-read-binding' && !reply.error && recoverable) {
        const binding = ownNativeReadBinding(reply.documentTextReadBinding);
        const prior = recoverable;
        const priorRequest = recoverableRequest;
        recoverable = undefined;
        recoverableRequest = undefined;
        if (
          binding &&
          context &&
          priorRequest &&
          (['editorId', 'documentId', 'generation', 'operationRevision'] as const).every(
            (key) => priorRequest[key] === context[key],
          ) &&
          (Object.keys(prior.binding) as (keyof NativeReadBinding)[]).every(
            (key) => prior.binding[key] === binding[key],
          )
        )
          scope = Object.freeze({});
      }
      if (reply.content !== undefined && !reply.error) scope = Object.freeze({});
      else if (reply.meta?.changed === true) scope = undefined;
      const captured = scope;
      if (!captured) return;
      const origin = nativeReadSourceOrigin(
        reply,
        context,
        sequence,
        contract(),
        captured,
        () => valid() && scope === captured,
      );
      if (origin) {
        replies.set(reply, origin);
        last = origin;
      }
    },
    consume(reply: RuntimeReply, context: RuntimeRequestContext) {
      const origin = replies.get(reply);
      replies.delete(reply);
      return origin && valid() && origin.authority() && sameRequestContext(origin.context, context)
        ? origin
        : undefined;
    },
    revoke,
  };
}
