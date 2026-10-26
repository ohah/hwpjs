import type { InputSurfaceLease } from '@hwpjs/core';
import type { EditorState, StateToken } from '@hwpjs/core';
import type { RuntimeMessage, RuntimeReply } from '@hwpjs/core';
import type { CommandResult } from '@hwpjs/core';

/** Admission and acknowledgement only; the editor owns the document queue. */
export function createControlBridge(options: {
  state(): EditorState;
  lease: InputSurfaceLease;
  acknowledge(reply: RuntimeReply, state?: EditorState): void;
  error(error: unknown): void;
}) {
  let closed = false;
  type PendingRequest = {
    id: symbol;
    kind: RuntimeMessage['kind'];
    documentId: StateToken['documentId'];
    generation: number;
  };
  let pending: PendingRequest | undefined;
  let task: Promise<void> = Promise.resolve();
  const current = (token: Pick<StateToken, 'documentId' | 'generation'>) => {
    const s = options.state();
    return (
      !closed &&
      options.lease.isActive() &&
      s.documentId === token.documentId &&
      s.generation === token.generation
    );
  };
  const release = (request: PendingRequest) => {
    if (
      pending?.id === request.id &&
      pending.documentId === request.documentId &&
      pending.generation === request.generation
    )
      pending = undefined;
  };
  return {
    pendingKind: () => (pending && current(pending) ? pending.kind : undefined),
    ready: () => !closed && options.lease.isActive() && options.state().status === 'ready',
    busy: () => closed || pending !== undefined || options.state().status !== 'ready',
    request(message: RuntimeMessage): boolean {
      if (closed || pending || !options.lease.isActive() || options.state().status !== 'ready')
        return false;
      // Enabling is a typed load policy; a ready surface is initialized from capabilities.
      if (message.kind === 'enable') return false;
      const owned = structuredClone(message);
      const token = options.state().token;
      const request: PendingRequest = {
        id: Symbol('input-surface-request'),
        kind: owned.kind,
        documentId: token.documentId,
        generation: token.generation,
      };
      pending = request;
      let acknowledged = false;
      task = Promise.resolve()
        .then(() => {
          if (!current(request)) return undefined;
          return options.lease.request(owned, { token, coordinates: 'legacy-native' });
        })
        .then((answer) => {
          release(request);
          if (!answer || !current(request)) return;
          if ('status' in answer && 'state' in answer) {
            const result = answer as CommandResult;
            if (options.state().operationRevision !== result.state.operationRevision) return;
            acknowledged = true;
            options.acknowledge(
              {
                ...owned,
                ...result.reply,
                kind: message.kind,
                origin: message.origin,
                ...(result.error ? { error: result.error } : {}),
                applied:
                  result.status === 'committed-refresh-required' ||
                  result.status === 'committed-with-snapshot',
              },
              result.state,
            );
          } else {
            acknowledged = true;
            options.acknowledge(answer as RuntimeReply);
          }
        })
        .catch((error) => {
          release(request);
          if (acknowledged) {
            // 이미 전달한 Native/core 응답을 UI 오류 때문에 미적용 응답으로 바꾸지 않습니다.
            if (!closed) {
              const callbackError = new Error(
                '문서 응답 후 화면 반영 콜백에서 오류가 발생했습니다.',
                { cause: error },
              );
              callbackError.name = 'InputSurfaceAcknowledgementCallbackError';
              Object.assign(callbackError, {
                documentId: request.documentId,
                generation: request.generation,
              });
              options.error(callbackError);
            }
            return;
          }
          if (!current(request)) return;
          options.error(error);
          options.acknowledge({
            ...owned,
            kind: message.kind,
            origin: message.origin,
            error: String(error),
            applied: false,
          });
        });
      return true;
    },
    async flush() {
      await task;
    },
    close() {
      closed = true;
      pending = undefined;
    },
  };
}
