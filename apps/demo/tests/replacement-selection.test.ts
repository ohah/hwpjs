import test from 'node:test';import assert from 'node:assert/strict';import {EditorState,type SelectionTarget} from '@hwpjs/core';import {replacementCaret} from '../src/replacement-selection.ts';
// Controlled public observations only; real Native/browser evidence is recorded separately.
function fixture(format:'hwp5'|'hwpx'='hwp5',change?:(old:any,next:any)=>void){const token={editorId:'editor',documentId:'document',generation:1,operationRevision:4,viewRevision:8};const target={...token,coordinateSpace:'display',format,owner:'section:0:body',section:0,paragraph:2,startUnit:0,endUnit:2,affinity:'forward'} as SelectionTarget;const ref={kind:'original',id:'12',scope:'worker:1',section:0,row:0,column:0,epoch:'2'};const old:any={...token,stateVersion:10,status:'ready',selection:target,content:{format,paragraphs:[{section:0,paragraph:2,text:'AB AB',selectionOwner:target.owner,...(format==='hwp5'?{currentReference:ref}:{})}]}};const next:any={...token,operationRevision:5,viewRevision:9,stateVersion:11,status:'ready',content:{format,paragraphs:[{section:0,paragraph:2,text:'Z AB',selectionOwner:target.owner,...(format==='hwp5'?{currentReference:{...ref,epoch:'3'}}:{})}]}};change?.(old,next);return{before:new EditorState(old),after:new EditorState(next),target};}
for(const format of ['hwp5','hwpx'] as const)test('fresh owned single transition caret '+format,()=>{const f=fixture(format),r=replacementCaret(f.before,f.after,f.target,'Z');assert(r);assert.equal(r.startUnit,1);assert.equal(r.endUnit,1);assert.deepEqual(r&&{...r,coordinateSpace:undefined,format:undefined,owner:undefined,section:undefined,paragraph:undefined,startUnit:undefined,endUnit:undefined,affinity:undefined},{...f.after.token,coordinateSpace:undefined,format:undefined,owner:undefined,section:undefined,paragraph:undefined,startUnit:undefined,endUnit:undefined,affinity:undefined});});
const negatives:{name:string;change:(old:any,next:any)=>void}[]=[
{name:'foreign document or generation',change:(_,n)=>{n.generation++;}},
{name:'extra public selection publication is not guessed away',change:(_,n)=>{n.stateVersion++;}},
{name:'foreign mutation revision',change:(_,n)=>{n.operationRevision++;}},
{name:'concurrent selection remains authoritative',change:(_,n)=>{n.selection={owner:'another'};}},
{name:'whole paragraph differs outside replacement',change:(_,n)=>{n.content.paragraphs[0].text='Z changed';}},
{name:'duplicate paragraph observations',change:(_,n)=>{n.content.paragraphs.push({...n.content.paragraphs[0]});}},
{name:'owner differs',change:(_,n)=>{n.content.paragraphs[0].selectionOwner='section:0:table:1:list:2';}},
{name:'reference source changes',change:(_,n)=>{n.content.paragraphs[0].currentReference.id='99';}},
{name:'reference scope changes',change:(_,n)=>{n.content.paragraphs[0].currentReference.scope='other';}},
{name:'unproven epoch jump',change:(_,n)=>{n.content.paragraphs[0].currentReference.epoch='4';}},
{name:'clipped snapshot',change:(_,n)=>{n.content.paragraphs[0].clipped=true;}},
];for(const entry of negatives)test('refuse '+entry.name,()=>{const f=fixture('hwp5',entry.change);assert.equal(replacementCaret(f.before,f.after,f.target,'Z'),null);});
test('structural newline is not restored as a single paragraph',()=>{const f=fixture();assert.equal(replacementCaret(f.before,f.after,f.target,'Z\n'),null);});
