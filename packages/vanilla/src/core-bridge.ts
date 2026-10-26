import type { InputSurfaceLease } from "@hwpjs/core";
import type { EditorState, StateToken } from "@hwpjs/core";
import type { RuntimeMessage, RuntimeReply } from "@hwpjs/core";
import type { CommandResult } from "@hwpjs/core";

/** Admission and acknowledgement only; the editor owns the document queue. */
export function createControlBridge(options: {
  state(): EditorState;
  lease: InputSurfaceLease;
  acknowledge(reply: RuntimeReply, state?: EditorState): void;
  error(error: unknown): void;
}) {
  let closed = false,
    pending = false;
  let task: Promise<void> = Promise.resolve();
  const current = (token: StateToken) => {
    const s = options.state();
    return (
      !closed &&
      options.lease.isActive() &&
      s.documentId === token.documentId &&
      s.generation === token.generation
    );
  };
  return {
    ready: () => !closed && options.lease.isActive() && options.state().status === "ready",
    busy: () => closed || pending || options.state().status !== "ready",
    request(message: RuntimeMessage): boolean {
      if (closed || pending || !options.lease.isActive() || options.state().status !== "ready")
        return false;
      // Enabling is a typed load policy; a ready surface is initialized from capabilities.
      if (message.kind === "enable") return false;
      const owned = structuredClone(message);
      const token = options.state().token;
      pending = true;
      task = Promise.resolve()
        .then(() => {
          if (!current(token)) return undefined;
          return options.lease.request(owned, { token, coordinates: "legacy-native" });
        })
        .then((answer) => {
          pending = false;
          if (!answer || !current(token)) return;
          if ("status" in answer && "state" in answer) {
            const result = answer as CommandResult;
            if (options.state().operationRevision !== result.state.operationRevision) return;
            options.acknowledge(
              {
                ...owned,
                ...result.reply,
                kind: message.kind,
                origin: message.origin,
                ...(result.error ? { error: result.error } : {}),
                applied:
                  result.status === "committed-refresh-required" ||
                  result.status === "committed-with-snapshot",
              },
              result.state,
            );
          } else options.acknowledge(answer as RuntimeReply);
        })
        .catch((error) => {
          pending = false;
          if (!current(token)) return;
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
    },
  };
}
