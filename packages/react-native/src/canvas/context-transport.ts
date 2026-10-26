// @ts-ignore 선언 없는 순수 협상 모듈입니다.
import { configureNativeHistory } from './history-negotiation.mjs';
// @ts-ignore Canonical untyped derived offset projector; no document engine.
import { retainedTextView, sourceTextChange } from '../../../../web/preview/text-offsets.mjs';
import type { RuntimeMessage, RuntimeReply } from '@hwpjs/core';
import { createNativeProvider } from '../provider.ts';
import type { NativeProvider } from '../provider.ts';
import { createNativeContextPort } from './context-port.ts';
import type { NativeJsiContextBinding } from './context-port.ts';
import type { NativeContextResult, NativeContextToken } from './context-protocol.ts';
import type { NativeRuntimeTransport } from '../native/transport.ts';

// Encoding and owned DTO conversion only. Native owns text, eligibility and history.
const decode = (bytes: Uint8Array) =>
  decodeURIComponent(Array.from(bytes, (b) => '%' + b.toString(16).padStart(2, '0')).join(''));
const encode = (text: string) =>
  Uint8Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
const failure = (kind: string, error: string): RuntimeReply => ({
  kind,
  error,
  applied: false,
  meta: { application: 'unapplied', changed: false },
});

/** Requires the additive Native snapshot contract. No saved/source document cache. */
export async function createNativeContextTransport(
  binding: NativeJsiContextBinding,
  observe?: (event: Record<string, unknown>) => void,
): Promise<
  NativeRuntimeTransport & {
    renderSources(expectedRevision: number): Promise<Uint8Array>;
    pictureBytes(
      expectedRevision: number,
      section: number,
      pictureNode: number,
    ): Promise<Uint8Array>;
  }
> {
  const raw = createNativeContextPort(binding);
  const note = (event: Record<string, unknown>) => {
    try {
      observe?.(event);
    } catch {
      /* diagnostics never changes document mutation outcome */
    }
  };
  const tokenInfo = (t: any) => (t ? { slot: t.slot, generation: t.generation } : null);
  const port = {
    descriptor: raw.descriptor,
    async request(packet: any) {
      note({
        event: 'native-request',
        kind: packet.kind,
        token: tokenInfo(packet.token),
        expectedRevision: packet.expectedRevision,
      });
      const reply = await raw.request(packet);
      note({
        event: 'native-reply',
        kind: reply.kind,
        status: reply.status,
        token: tokenInfo(reply.token ?? packet.token),
        revision: reply.revision,
        outputRevision: reply.outputRevision,
      });
      return reply;
    },
    invalidate() {
      note({ event: 'native-invalidate' });
      raw.invalidate();
    },
    async dispose() {
      const r = await raw.dispose();
      note({ event: 'native-dispose' });
      return r;
    },
  };
  if (
    port.descriptor.protocol !== 'hwpjs.native-context/1' ||
    port.descriptor.abiVersion !== 1 ||
    port.descriptor.projection !== 'format-native-wire'
  ) {
    await port.dispose();
    throw Error('NativeContextProtocolMismatch');
  }
  if (port.descriptor.snapshotProtocol !== 'hwpjs.native-snapshot/2') {
    await port.dispose();
    throw Error('NativeSnapshotUnavailable');
  }
  if (port.descriptor.renderSourcesProtocol !== 'hwpjs.native-render-sources/3') {
    await port.dispose();
    throw Error('NativeRenderSourcesUnavailable');
  }
  let token: NativeContextToken | undefined,
    revision = 0,
    terminal = false,
    editingEnabled = false;
  const checked = (reply: NativeContextResult) => {
    if (reply.revision !== undefined) revision = reply.revision;
    return reply;
  };
  function projected(content: any) {
    const paragraphs = content.paragraphs.map((row: any) => {
      const retained = content.format === 'hwp5' ? retainedTextView(row) : null;
      const complete = Boolean(row.rawPlain || retained);
      return {
        ...row,
        text: retained?.text ?? row.text,
        ...(retained ? { sourceOffsets: retained.offsets } : {}),
        displayComplete: complete,
        projectionUnavailable: !complete,
        editable: row.editable && complete,
      };
    });
    return {
      ...content,
      paragraphs,
      completeness: {
        ...content.window,
        displayComplete: paragraphs.every((p: any) => p.displayComplete),
        immediateOwnerComplete: paragraphs.every((p: any) => p.selectionOwner !== null),
        ownershipGraphComplete: false,
        unsupportedWriteOwners: [
          ...new Set(paragraphs.filter((p: any) => !p.editable).map((p: any) => p.ownerKind)),
        ],
      },
    };
  }
  async function snapshot(
    kind: string,
    mutation?: NativeContextResult,
    window?: { section: number; startOrdinal: number; count: number },
  ): Promise<RuntimeReply> {
    const r = checked(
      await port.request(
        window
          ? { kind: 'snapshot-window', token: token!, ...window, expectedRevision: revision }
          : { kind: 'snapshot', token: token! },
      ),
    );
    if (r.status !== 0 || !r.bytes)
      return {
        kind,
        error: r.error ?? 'NativeSnapshotFailed',
        meta: mutation?.meta ?? { application: 'unapplied', changed: false },
      };
    const content = projected(JSON.parse(decode(r.bytes)));
    if (
      content.protocol !== 'hwpjs.native-snapshot/2' ||
      content.projection !== 'native-owners-v2' ||
      !['hwp5', 'hwpx'].includes(content.format) ||
      !Array.isArray(content.paragraphs) ||
      content.nativeRevision !== revision ||
      !Array.isArray(content.historyRevisions)
    )
      throw Error('NativeInvalidSnapshot');
    // Runtime enable admission is host state, not a document/protection model.
    // Native eligibility is retained; no text/owner/coordinate is reconstructed.
    const view = editingEnabled
      ? content
      : {
          ...content,
          paragraphs: content.paragraphs.map((row: Record<string, unknown>) => ({
            ...row,
            editable: false,
          })),
        };
    return {
      kind,
      content: view,
      historyRevision: content.historyRevision,
      historyRevisions: content.historyRevisions,
      historyStats: content.historyStats,
      capabilities: {
        nativeCapability: content.capability,
        completeness: content.completeness,
        nativeCanvas: {
          backend: 'UIKit/CoreGraphics',
          renderSourcesProtocol: 'hwpjs.native-render-sources/3',
          textBoundaryProtocol: 'hwpjs.native-text-boundaries/1',
          word: false,
          fullLayout: false,
          android: false,
        },
        nativeContext: true,
        projection: 'native-owners-v2',
        fullLayout: false,
        canvas: false,
        nativeIme: false,
      },
      ...(mutation
        ? { applied: mutation.meta.application === 'applied', meta: mutation.meta }
        : {}),
    };
  }
  return {
    async renderSources(expectedRevision: number) {
      if (terminal || !token) throw Error('NativeDocumentNotLoaded');
      const result = await port.request({ kind: 'render-sources', token, expectedRevision });
      if (result.status !== 0 || !result.bytes || result.outputRevision !== expectedRevision)
        throw Error(result.error ?? 'StaleRenderSources');
      return result.bytes;
    },
    async pictureBytes(expectedRevision: number, section: number, pictureNode: number) {
      if (terminal || !token) throw Error('NativeDocumentNotLoaded');
      const result = await port.request({
        kind: 'picture-bytes',
        token,
        expectedRevision,
        section,
        pictureNode,
      });
      if (result.status !== 0 || !result.bytes || result.outputRevision !== expectedRevision)
        throw Error(result.error ?? 'StalePictureBytes');
      return result.bytes;
    },
    descriptor: {
      protocol: 'hwpjs.editor-runtime/1',
      abiVersion: 1,
      projection: 'shared-provider',
      implementation: 'NativeContext+owned-snapshot/1',
    },
    async request(message: RuntimeMessage): Promise<RuntimeReply> {
      if (terminal) throw Error('NativeRuntimeDisposed');
      const kind = message.kind;
      if (kind === 'load') {
        if (token) return failure(kind, 'NativeContextAlreadyLoaded');
        if (
          message.password !== undefined ||
          message.availableSectionCopy === true ||
          message.allowObservedChartOleDeviations === true
        )
          return failure(kind, 'NativeLoadOptionsUnsupported');
        if (
          !['hwp5', 'hwpx'].includes(message.format as string) ||
          !(message.bytes instanceof Uint8Array || message.bytes instanceof ArrayBuffer)
        )
          return failure(kind, 'NativeInvalidLoad');
        const r = checked(
          await port.request({
            kind: 'open',
            format: message.format === 'hwp5' ? 1 : 2,
            bytes: message.bytes,
          }),
        );
        if (r.status !== 0 || !r.token) return failure(kind, r.error ?? 'NativeOpenFailed');
        token = r.token;
        return snapshot(kind);
      }
      if (!token) return failure(kind, 'NativeDocumentNotLoaded');
      if (kind === 'enable' || kind === 'refresh') {
        if (
          Object.keys(message).some(
            (key) => key !== 'kind' && !(kind === 'enable' && key === 'history'),
          )
        )
          return failure(kind, 'NativeEnableOptionsUnsupported');
        if (kind === 'enable' && message.history !== undefined) {
          const configured = await configureNativeHistory(port, token, revision, message.history);
          if (configured.error || configured.status !== 0)
            return failure(kind, configured.error ?? 'NativeHistoryConfigureFailed');
        }
        if (kind === 'enable') editingEnabled = true;
        return snapshot(kind);
      }
      if (kind === 'splice') {
        if (!editingEnabled) return failure(kind, 'NativeEditingNotEnabled');
        if (
          typeof message.text !== 'string' ||
          ![message.section, message.paragraph, message.startUnit, message.endUnit].every(
            (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
          ) ||
          (message.endUnit as number) < (message.startUnit as number) ||
          message.reference !== undefined
        )
          return failure(kind, 'NativeInvalidSplice');
        // Requery current Native eligibility; never trust a caller's cached row.
        const observation = await snapshot(kind);
        if (observation.error) return observation;
        const rows = (
          observation.content as {
            paragraphs: Array<{
              section: number;
              paragraph: number;
              editable: boolean;
              text: string;
            }>;
          }
        ).paragraphs;
        const row = rows.find(
          (r) => r.section === message.section && r.paragraph === message.paragraph,
        );
        if (!row?.editable || (message.endUnit as number) > row.text.length)
          return failure(kind, 'NativeProjectionProtectedRange');
        const r = checked(
          await port.request({
            kind: 'splice',
            token,
            expectedRevision: revision,
            section: message.section as number,
            paragraph: message.paragraph as number,
            startUnit: message.startUnit as number,
            deletedUnits: (message.endUnit as number) - (message.startUnit as number),
            bytes: encode(message.text),
          }),
        );
        if (r.status !== 0 && r.status !== 1)
          return {
            kind,
            error: r.error ?? 'NativeSpliceFailed',
            meta: r.meta,
            historyRevision: r.historyRevision,
          };
        return snapshot(kind, r);
      }
      if (kind === 'undo' || kind === 'redo') {
        if (!editingEnabled) return failure(kind, 'NativeEditingNotEnabled');
        const r = checked(
          await port.request({
            kind: 'history',
            token,
            expectedRevision: revision,
            redo: kind === 'redo',
          }),
        );
        if (r.status !== 0 && r.status !== 1)
          return {
            kind,
            error: r.error ?? 'NativeHistoryFailed',
            meta: r.meta,
            historyRevision: r.historyRevision,
          };
        return snapshot(kind, r);
      }
      if (kind === 'save') {
        if (message.allowUnprotectedOutput === true)
          return failure(kind, 'NativeUnprotectedOutputUnsupported');
        const r = checked(
          await port.request({
            kind: 'save',
            token,
            expectedRevision: revision,
            allowStaleLayout: message.allowStaleLayout === true,
          }),
        );
        if (r.status !== 0) return failure(kind, r.error ?? 'NativeSaveFailed');
        return {
          kind,
          bytes: r.bytes,
          historyRevision: r.historyRevision,
          layoutRequiresReflow: r.layoutRequiresReflow,
          meta: r.meta,
        };
      }
      if (kind === 'query-edit-window' || kind === 'query-window') {
        const section = message.section,
          startOrdinal = message.startOrdinal,
          count = message.count;
        if (
          ![section, startOrdinal, count].every(
            (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
          ) ||
          count === 0
        )
          return failure(kind, 'InvalidWindowRange');
        return snapshot(kind, undefined, {
          section: section as number,
          startOrdinal: startOrdinal as number,
          count: count as number,
        });
      }
      if (kind === 'query-edit-range') {
        const observation = await snapshot(kind);
        if (observation.error) return observation;
        const content = observation.content as any,
          row = content.paragraphs.find(
            (p: any) => p.section === message.section && p.paragraph === message.paragraph,
          );
        if (!row || message.owner !== row.selectionOwner)
          return failure(kind, 'InvalidSelectionOwner');
        if (
          ![message.startUnit, message.endUnit].every(
            (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0,
          ) ||
          Number(message.startUnit) > Number(message.endUnit) ||
          Number(message.endUnit) > row.text.length ||
          !row.displayComplete
        )
          return failure(kind, 'InvalidTextPosition');
        const range = { startUnit: message.startUnit, endUnit: message.endUnit };
        return {
          kind,
          owner: row.selectionOwner,
          displayRange: range,
          sourceCoordinateSpace: 'format-native-utf16',
          sourceRange:
            content.format === 'hwp5' ? sourceTextChange(range, row.sourceOffsets) : range,
          editable: row.editable,
          nativeRevision: content.nativeRevision,
        };
      }
      if (kind === 'query-current-text') {
        const r = await snapshot(kind);
        if (r.error) return r;
        const rows = (
          r.content as { paragraphs: Array<{ section: number; paragraph: number; text: string }> }
        ).paragraphs;
        const row = rows.find(
          (p) => p.section === message.section && p.paragraph === message.paragraph,
        );
        return row
          ? (row as any).displayComplete
            ? {
                kind,
                text: row.text,
                owner: (row as any).selectionOwner,
                displayComplete: true,
                coordinateSpace: 'display-utf16',
              }
            : failure(kind, 'NativeDisplayProjectionIncomplete')
          : failure(kind, 'NativeParagraphNotFound');
      }
      return failure(kind, 'NativeOperationUnsupported:' + kind);
    },
    invalidate() {
      terminal = true;
      port.invalidate();
    },
    async dispose() {
      terminal = true;
      const r = await port.dispose();
      if (r.status !== 0) throw Error(r.error ?? 'NativeDisposeFailed');
    },
  };
}
export function createNativeContextProvider(binding?: NativeJsiContextBinding): NativeProvider {
  return createNativeProvider(
    binding ? { createTransport: () => createNativeContextTransport(binding) } : {},
  );
}
