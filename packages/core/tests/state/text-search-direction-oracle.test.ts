import {test,expect} from 'bun:test';
import {EditorState,findTextMatch} from '../../src/index.ts';
import type {SelectionTarget} from '../../src/index.ts';
const texts=['가가 가😀가','😀가가','unowned 가','clipped 가','가😀',''];
const rows=texts.map((text,paragraph)=>({section:0,paragraph,text,editable:true,...(paragraph===2?{}:{selectionOwner:'section:0:body'}),...(paragraph===3?{clipped:true}:{})}));
const token={editorId:'e',documentId:'d',generation:1,operationRevision:1,viewRevision:1};
function state(paragraph?:number,unit=0){return new EditorState({...token,status:'ready',stateVersion:1,content:{format:'hwpx',paragraphs:rows},selection:paragraph===undefined?null:{...token,coordinateSpace:'display',format:'hwpx',owner:'section:0:body',section:0,paragraph,startUnit:unit,endUnit:unit,affinity:'forward'}});}
test('direction and wrap match an independent ordered occurrence list including overlaps and UTF-16 edges',()=>{
 let checks=0;
 for(const query of ['가','가가','😀','없음']){
  // Enumerate all substring occurrences, independent of the product traversal.
  const matches:Array<{paragraph:number;startUnit:number;endUnit:number}>=[];
  for(const row of rows){if(!('selectionOwner' in row)||row.clipped)continue;
   for(let at=0;at+query.length<=row.text.length;at++)if(row.text.slice(at,at+query.length)===query)matches.push({paragraph:row.paragraph,startUnit:at,endUnit:at+query.length});
  }
  for(const paragraph of [undefined,0,1,4,5])for(let unit=0;unit<=(paragraph===undefined?0:texts[paragraph].length);unit++){
   if(paragraph!==undefined&&unit>0&&/[\udc00-\udfff]/.test(texts[paragraph][unit]??'')&&/[\ud800-\udbff]/.test(texts[paragraph][unit-1]))continue;
   for(const direction of ['forward','backward'] as const)for(const wrap of [false,true])for(const origin of ['selection','document'] as const){
    const ordered=direction==='forward'?matches:[...matches].reverse();
    const candidates=paragraph===undefined||origin==='document'?ordered:ordered.filter(m=>direction==='forward'?m.paragraph>paragraph||m.paragraph===paragraph&&m.startUnit>=unit:m.paragraph<paragraph||m.paragraph===paragraph&&m.endUnit<=unit);
    const expected=candidates[0]??(wrap?ordered[0]:undefined),actual=findTextMatch(state(paragraph,unit),query,{direction,wrap,origin});
    expect(actual&&{paragraph:actual.paragraph,startUnit:actual.startUnit,endUnit:actual.endUnit}).toEqual(expected??null);checks++;
   }
  }
 }
 expect(checks).toBeGreaterThan(500);
});
