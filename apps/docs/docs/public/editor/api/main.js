import {createEditor,SPLICE_TEXT_COMMAND,getHistoryAvailability} from '../runtime/index.js';
import {createWorkerRuntimeFactory} from '../runtime/runtime.js';
import {mountApiPlayground} from './playground.js';
const editor=createEditor({runtimeFactory:createWorkerRuntimeFactory({workerURL:new URL('../runtime/worker.js',import.meta.url),wasmURL:new URL('../hwpjs/hwpjs.wasm',import.meta.url)})});
const panel=mountApiPlayground(document.querySelector('main'),{editor,spliceCommand:SPLICE_TEXT_COMMAND,getHistoryAvailability,async loadFixture(format){const name=format==='hwp5'?'noori.hwp':'noori.hwpx';const response=await fetch(new URL('../fixtures/'+name,import.meta.url));if(!response.ok)throw Error('FixtureFetchFailed');return new Uint8Array(await response.arrayBuffer());}});
window.addEventListener('pagehide',()=>{panel.dispose();void editor.dispose();},{once:true});
