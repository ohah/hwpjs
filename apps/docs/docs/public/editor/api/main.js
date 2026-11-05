import {createEditor,SPLICE_TEXT_COMMAND,getHistoryAvailability,createParagraphSelection} from '../sdk/current/core.js';
import {createWorkerRuntimeFactory} from '../sdk/current/runtime.js';
import {mountApiPlayground} from './playground.js';
const editor=createEditor({runtimeFactory:createWorkerRuntimeFactory()});
const panel=mountApiPlayground(document.querySelector('main'),{editor,spliceCommand:SPLICE_TEXT_COMMAND,getHistoryAvailability,createParagraphSelection,async loadFixture(format){const name=format==='hwp5'?'noori.hwp':'noori.hwpx';const response=await fetch(new URL('../fixtures/'+name,import.meta.url));if(!response.ok)throw Error('FixtureFetchFailed');return new Uint8Array(await response.arrayBuffer());}});
addEventListener('pagehide',()=>{panel.dispose();void editor.dispose();},{once:true});
