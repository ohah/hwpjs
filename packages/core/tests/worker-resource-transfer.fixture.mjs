import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const dataURL = (text) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const ts = async (path) => stripTypeScriptTypes(await readFile(path, 'utf8'), { mode: 'strip' });
const ownedURL = dataURL(await ts(workerData.owned));
const stubURL = dataURL(`
import { ownObservation } from ${JSON.stringify(ownedURL)};
const reused = new Uint8Array([1, 2, 3, 4]);
const memory = new WebAssembly.Memory({ initial: 1 });
const shared = new Uint8Array(new SharedArrayBuffer(4));
new Uint8Array(memory.buffer, 8, 3).set([7,8,9]);
let current = [11,22,33], previous;
export function createReaderEditorRuntime() { return {
 async request(m) {
  if (m.kind === 'inspect') return {kind:m.kind,reusedLength:reused.byteLength,memoryLength:memory.buffer.byteLength,reused:Array.from(reused),memory:Array.from(new Uint8Array(memory.buffer,8,3)),previous:previous?Array.from(previous.bytes):null,transport:globalThis.transportStats};
  if (m.kind === 'set-resource') {current=m.value;return {kind:m.kind};}
  if (m.kind === 'failure') throw Error('ControlledResourceFailure');
  if (m.delay) await new Promise(r=>setTimeout(r,m.delay));
  const bytes=m.source==='wasm'?new Uint8Array(memory.buffer,8,3):m.source==='reused'?reused:m.source==='shared'?shared:m.source==='subview'?reused.subarray(1,3):new Uint8Array(current);
  const raw={kind:m.replyKind??m.kind,section:0,pictureNode:3,bytes,...(m.error?{error:'ResourceRejected'}:{})};
  if(m.raw)return raw;
  previous=ownObservation(raw)();return previous;
 }, dispose() {}
}; }
`);
let helperURL;
if (workerData.helper) {
  let helper = await ts(workerData.helper);
  helper = helper.replace("'../state/owned.ts'", JSON.stringify(ownedURL));
  helperURL = dataURL(helper);
}
let worker = await ts(workerData.source);
worker = worker.replace("'./runtime/reader-runtime.ts'", JSON.stringify(stubURL));
if (helperURL)
  worker = worker.replace("'./internal/worker-resource-reply.ts'", JSON.stringify(helperURL));
globalThis.transportStats = [];
let failTransfer = workerData.failTransfer === true;
globalThis.postMessage = (value, transfer) => {
  const buffers = transfer ?? [];
  const before = buffers.map((b) => b.byteLength);
  if (failTransfer && buffers.length) {
    failTransfer = false;
    globalThis.transportStats.push({
      id: value.id,
      transfers: buffers.length,
      before,
      after: buffers.map((b) => b.byteLength),
      failed: true,
    });
    throw Error('ControlledPostTransferFailure');
  }
  parentPort.postMessage(value, transfer);
  globalThis.transportStats.push({
    id: value.id,
    kind: value.reply?.kind,
    transfers: buffers.length,
    before,
    after: buffers.map((b) => b.byteLength),
  });
};
await import(dataURL(worker));
parentPort.on('message', (data) => globalThis.onmessage({ data }));
parentPort.postMessage({ ready: true });
