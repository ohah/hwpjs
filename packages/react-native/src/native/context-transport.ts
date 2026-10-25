import type { RuntimeMessage, RuntimeReply } from '@hwpjs/core';
import { createNativeProvider } from '../provider.ts';
import type { NativeProvider } from '../provider.ts';
import { createNativeContextPort } from './context-port.ts';
import type { NativeJsiContextBinding } from './context-port.ts';
import type { NativeContextResult, NativeContextToken } from './context-protocol.ts';
import type { NativeRuntimeTransport } from './transport.ts';

// Encoding and owned DTO conversion only. Native owns text, eligibility and history.
const decode = (bytes: Uint8Array) => decodeURIComponent(Array.from(bytes, b => '%' + b.toString(16).padStart(2, '0')).join(''));
const encode = (text: string) => Uint8Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
const failure = (kind: string, error: string): RuntimeReply => ({ kind, error, applied: false, meta: { application: 'unapplied', changed: false } });

/** Requires the additive Native snapshot contract. No saved/source document cache. */
export async function createNativeContextTransport(binding: NativeJsiContextBinding): Promise<NativeRuntimeTransport> {
  const port = createNativeContextPort(binding);
  if (port.descriptor.snapshotProtocol !== 'hwpjs.native-snapshot/1') {
    await port.dispose();
    throw Error('NativeSnapshotUnavailable');
  }
  let token: NativeContextToken | undefined, revision = 0, terminal = false, editingEnabled = false;
  const checked = (reply: NativeContextResult) => {
    if (reply.revision !== undefined) revision = reply.revision;
    return reply;
  };
  async function snapshot(kind: string, mutation?: NativeContextResult): Promise<RuntimeReply> {
    const r = checked(await port.request({ kind: 'snapshot', token: token! }));
    if (r.status !== 0 || !r.bytes) return { kind, error: r.error ?? 'NativeSnapshotFailed', meta: mutation?.meta ?? { application: 'unapplied', changed: false } };
    const content = JSON.parse(decode(r.bytes));
    if (content.protocol !== 'hwpjs.native-snapshot/1' || content.projection !== 'plain-body-v1' ||
        !['hwp5', 'hwpx'].includes(content.format) || !Array.isArray(content.paragraphs) ||
        content.nativeRevision !== revision || !Array.isArray(content.historyRevisions)) throw Error('NativeInvalidSnapshot');
    // Runtime enable admission is host state, not a document/protection model.
    // Native eligibility is retained; no text/owner/coordinate is reconstructed.
    const view = editingEnabled ? content : {...content, paragraphs:content.paragraphs.map((row:Record<string,unknown>)=>({...row,editable:false}))};
    return { kind, content: view, historyRevision: content.historyRevision, historyRevisions: content.historyRevisions,
      capabilities: { nativeContext: true, projection: 'plain-body-v1', fullLayout: false, canvas: false, nativeIme: false },
      ...(mutation ? { applied: mutation.meta.application === 'applied', meta: mutation.meta } : {}) };
  }
  return {
    descriptor: { protocol: 'hwpjs.editor-runtime/1', abiVersion: 1, projection: 'shared-provider', implementation: 'NativeContext+owned-snapshot/1' },
    async request(message: RuntimeMessage): Promise<RuntimeReply> {
      if (terminal) throw Error('NativeRuntimeDisposed');
      const kind = message.kind;
      if (kind === 'load') {
        if (token) return failure(kind, 'NativeContextAlreadyLoaded');
        if (message.password !== undefined || message.availableSectionCopy === true || message.allowObservedChartOleDeviations === true) return failure(kind, 'NativeLoadOptionsUnsupported');
        if (!['hwp5', 'hwpx'].includes(message.format as string) || !(message.bytes instanceof Uint8Array || message.bytes instanceof ArrayBuffer)) return failure(kind, 'NativeInvalidLoad');
        const r = checked(await port.request({ kind: 'open', format: message.format === 'hwp5' ? 1 : 2, bytes: message.bytes }));
        if (r.status !== 0 || !r.token) return failure(kind, r.error ?? 'NativeOpenFailed');
        token = r.token;
        return snapshot(kind);
      }
      if (!token) return failure(kind, 'NativeDocumentNotLoaded');
      if (kind === 'enable' || kind === 'refresh') {
        if (Object.keys(message).some(key => key !== 'kind')) return failure(kind, 'NativeEnableOptionsUnsupported');
        if(kind==='enable') editingEnabled=true;
        return snapshot(kind);
      }
      if (kind === 'splice') {
        if(!editingEnabled) return failure(kind,'NativeEditingNotEnabled');
        if (typeof message.text !== 'string' || ![message.section,message.paragraph,message.startUnit,message.endUnit].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff) || (message.endUnit as number) < (message.startUnit as number) || message.reference !== undefined) return failure(kind,'NativeInvalidSplice');
        // Requery current Native eligibility; never trust a caller's cached row.
        const observation = await snapshot(kind);
        if (observation.error) return observation;
        const rows = (observation.content as {paragraphs: Array<{section:number;paragraph:number;editable:boolean;text:string}>}).paragraphs;
        const row = rows.find(r => r.section === message.section && r.paragraph === message.paragraph);
        if (!row?.editable || (message.endUnit as number) > row.text.length) return failure(kind,'NativeProjectionProtectedRange');
        const r = checked(await port.request({kind:'splice',token,expectedRevision:revision,section:message.section as number,paragraph:message.paragraph as number,startUnit:message.startUnit as number,deletedUnits:(message.endUnit as number)-(message.startUnit as number),bytes:encode(message.text)}));
        if (r.status !== 0 && r.status !== 1) return {kind,error:r.error??'NativeSpliceFailed',meta:r.meta,historyRevision:r.historyRevision};
        return snapshot(kind,r);
      }
      if (kind === 'undo' || kind === 'redo') {
        if(!editingEnabled) return failure(kind,'NativeEditingNotEnabled');
        const r = checked(await port.request({kind:'history',token,expectedRevision:revision,redo:kind==='redo'}));
        if(r.status!==0 && r.status!==1) return {kind,error:r.error??'NativeHistoryFailed',meta:r.meta,historyRevision:r.historyRevision};
        return snapshot(kind,r);
      }
      if (kind === 'save') {
        if (message.allowUnprotectedOutput === true) return failure(kind,'NativeUnprotectedOutputUnsupported');
        const r = checked(await port.request({kind:'save',token,expectedRevision:revision,allowStaleLayout:message.allowStaleLayout===true}));
        if(r.status!==0) return failure(kind,r.error??'NativeSaveFailed');
        return {kind,bytes:r.bytes,historyRevision:r.historyRevision,layoutRequiresReflow:r.layoutRequiresReflow,meta:r.meta};
      }
      if (kind === 'query-current-text') {
        const r = await snapshot(kind);
        if(r.error) return r;
        const rows=(r.content as {paragraphs:Array<{section:number;paragraph:number;text:string}>}).paragraphs;
        const row=rows.find(p=>p.section===message.section&&p.paragraph===message.paragraph);
        return row ? {kind,text:row.text} : failure(kind,'NativeParagraphNotFound');
      }
      return failure(kind,'NativeOperationUnsupported:'+kind);
    },
    invalidate() { terminal=true;port.invalidate(); },
    async dispose() { terminal=true;const r=await port.dispose();if(r.status!==0) throw Error(r.error??'NativeDisposeFailed'); },
  };
}
export function createNativeContextProvider(binding?: NativeJsiContextBinding): NativeProvider {
  return createNativeProvider(binding ? {createTransport:()=>createNativeContextTransport(binding)} : {});
}
