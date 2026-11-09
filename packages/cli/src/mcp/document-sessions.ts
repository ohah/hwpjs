import { randomBytes } from 'node:crypto';
import { openDocument } from '../engine.ts';
import { readDocumentModel } from '../document-model.ts';
import { renderDocument } from '../render.ts';
import { renderReadResponse } from '../read-operation.ts';
import { createFiles, MAX_DOCUMENT_BYTES, MAX_WASM_BYTES } from '../files.ts';
import type { OpenedDocument } from '../types/native-document.ts';
import type { ReadFormat, ReadView } from '../types/document-view.ts';
import type { DocumentToolsOptions } from './tools.ts';

export const DOCUMENT_SESSION_LIMITS = Object.freeze({
  maxSessions: 4,
  maxOutputBytes: 16 * 1024 * 1024,
  maxOwnedInputBytes: 128 * 1024 * 1024,
});
export interface DocumentSessionDependencies {
  files?: Pick<ReturnType<typeof createFiles>, 'readInputSnapshot' | 'resolveWasmPath'>;
  openDocument?: typeof openDocument;
  readDocumentModel?: typeof readDocumentModel;
  renderDocument?: typeof renderDocument;
}

/** Reservations include in-flight opens. Handles and ownership never cross managers. */
export function createDocumentSessionManager(
  options: Pick<DocumentToolsOptions, 'wasmPath' | 'mainModuleURL'> = {},
  dependencies: DocumentSessionDependencies = {},
) {
  const files = dependencies.files ?? createFiles();
  const open = dependencies.openDocument ?? openDocument;
  const observe = dependencies.readDocumentModel ?? readDocumentModel;
  const render = dependencies.renderDocument ?? renderDocument;
  const sessions = new Map<
    string,
    { document: OpenedDocument; reads: Set<Promise<unknown>>; bytes: number }
  >();
  const closing = new Set<Promise<void>>();
  const pending = new Set<Promise<unknown>>();
  let slots = 0,
    ownedBytes = 0,
    disposed = false;
  let disposal: Promise<void> | undefined;
  const ready = () => {
    if (disposed) throw Error('DocumentSessionsDisposed');
  };
  const lookup = (sessionId: string) => {
    const entry = sessions.get(sessionId);
    if (!entry) throw Error('InvalidDocumentSession');
    return entry;
  };
  function close(sessionId: string): Promise<void> {
    const entry = lookup(sessionId);
    sessions.delete(sessionId);
    const operation = Promise.allSettled(entry.reads).then(() => {
      try {
        entry.document.close();
      } finally {
        slots--;
        ownedBytes -= entry.bytes;
      }
    });
    closing.add(operation);
    void operation.then(
      () => closing.delete(operation),
      () => closing.delete(operation),
    );
    return operation;
  }
  async function openReserved(inputPath: string, expectedSha256?: string) {
    ready();
    if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(expectedSha256))
      throw Error('InvalidExpectedSha256');
    if (slots >= DOCUMENT_SESSION_LIMITS.maxSessions) throw Error('DocumentSessionLimitExceeded');
    if (ownedBytes + MAX_DOCUMENT_BYTES > DOCUMENT_SESSION_LIMITS.maxOwnedInputBytes)
      throw Error('DocumentSessionInputLimitExceeded');
    slots++;
    ownedBytes += MAX_DOCUMENT_BYTES;
    let reserved = MAX_DOCUMENT_BYTES;
    let document: OpenedDocument | undefined;
    let retained = false;
    try {
      const snapshot = await files.readInputSnapshot(inputPath, { maxBytes: MAX_DOCUMENT_BYTES });
      ready();
      if (
        !(snapshot.bytes instanceof Uint8Array) ||
        !snapshot.bytes.length ||
        snapshot.bytes.length > MAX_DOCUMENT_BYTES ||
        !/^[a-f0-9]{64}$/.test(snapshot.sha256)
      )
        throw Error('InvalidInputSnapshot');
      if (expectedSha256 !== undefined && snapshot.sha256 !== expectedSha256)
        throw Error('SourceSha256Mismatch');
      ownedBytes -= reserved - snapshot.bytes.length;
      reserved = snapshot.bytes.length;
      const wasmPath = files.resolveWasmPath(options.wasmPath, options.mainModuleURL);
      const wasm = await files.readInputSnapshot(wasmPath, { maxBytes: MAX_WASM_BYTES });
      ready();
      document = await open({
        bytes: snapshot.bytes,
        wasm: wasm.bytes,
        expectedSha256: snapshot.sha256,
      });
      ready();
      if (
        (document.format !== 'hwp5' && document.format !== 'hwpx') ||
        document.sourceSha256 !== snapshot.sha256
      )
        throw Error('InvalidEngineFormat');
      let sessionId: string;
      do {
        sessionId = randomBytes(32).toString('hex');
      } while (sessions.has(sessionId));
      sessions.set(sessionId, { document, reads: new Set(), bytes: reserved });
      retained = true;
      return {
        sessionId,
        format: document.format,
        sourceSha256: document.sourceSha256,
        sectionCount: document.sectionCount,
      };
    } finally {
      if (!retained) {
        slots--;
        ownedBytes -= reserved;
        document?.close();
      }
    }
  }
  return {
    open(inputPath: string, expectedSha256?: string) {
      const operation = openReserved(inputPath, expectedSha256);
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    read(
      sessionId: string,
      { format = 'text', view = 'content' }: { format?: ReadFormat; view?: ReadView } = {},
    ): Promise<string> {
      ready();
      const entry = lookup(sessionId);
      // One Native observer per document; do not accumulate a pending queue.
      if (entry.reads.size !== 0) throw Error('DocumentSessionBusy');
      const operation = (async () => {
        // Register the lease before observing, including synchronous failures.
        await Promise.resolve();
        const document = entry.document;
        const model = await observe({
          format: document.format,
          sourceSha256: document.sourceSha256,
          sectionCount: document.sectionCount,
          sdk: document.sdk,
        });
        if (
          model.version !== 1 ||
          model.format !== document.format ||
          model.sourceSha256 !== document.sourceSha256
        )
          throw Error('InvalidEngineModel');
        const text = render(model, {
          format,
          view,
          maxOutputUnits: DOCUMENT_SESSION_LIMITS.maxOutputBytes,
        });
        const response = renderReadResponse(
          { format: document.format, sourceSha256: document.sourceSha256, text },
          { view },
        );
        if (Buffer.byteLength(response, 'utf8') > DOCUMENT_SESSION_LIMITS.maxOutputBytes)
          throw Error('DocumentSessionOutputLimitExceeded');
        return response;
      })();
      entry.reads.add(operation);
      void operation.then(
        () => entry.reads.delete(operation),
        () => {
          entry.reads.delete(operation);
          if (sessions.has(sessionId)) void close(sessionId).catch(() => {});
        },
      );
      return operation;
    },
    close,
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true;
      for (const id of sessions.keys()) close(id);
      const pendingCount = pending.size;
      disposal = Promise.allSettled([...pending, ...closing]).then((results) => {
        // Pending open errors are returned to their callers; closing failures are teardown failures.
        const failures = results
          .slice(pendingCount)
          .filter((result) => result.status === 'rejected');
        if (failures.length)
          throw new AggregateError(
            failures.map((result) => result.reason),
            'DocumentSessionCleanupFailed',
          );
      });
      return disposal;
    },
  };
}
export type DocumentSessionManager = ReturnType<typeof createDocumentSessionManager>;
