import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {demoFixtures} from '../web/preview/fixture-catalog.mjs';
import {closeOwnedBrowser} from './browser/session-close.mjs';
import {clickBrowserTarget} from './browser/click-target.mjs';
const origin=process.argv[2]??'http://127.0.0.1:49002';
const output=resolve('zig-out/verification/color-pair-browser',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(output,{recursive:true});
const session=execFileSync('agent-browser',['session','id','--scope','worktree','--prefix','hwpjs-background-survey'],{encoding:'utf8'}).trim();
const command=(...args)=>{const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024}));assert.equal(r.success,true,JSON.stringify(r.error));return r.data;};
const evaluate=s=>command('eval',s).result;
assert.equal(command('session','info').active,false);const cases=[];let cleanup;
try{for(const stem of ['noori','borderfill','chart','sample-5017','table-bug'])for(const extension of ['hwp','hwpx']){
 const name=`${stem}.${extension}`,row={name};cases.push(row);
 try{
  command('set','viewport','1440','1100');command('open',origin+'/demo/vanilla');command('wait','--fn','document.querySelector("[data-role=fixture-picker]")?.disabled===false');
  evaluate(`(()=>{window.__colors=[];const f=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){let sample;if(this.canvas.isConnected){const m=this.getTransform(),p=m.transformPoint(new DOMPoint(x+w*.8,y+h*.6)),inside=p.x>=0&&p.y>=0&&p.x<this.canvas.width&&p.y<this.canvas.height;sample={color:this.fillStyle,x,y,w,h,inside,pixel:null};window.__colors.push(sample);}const result=f.call(this,x,y,w,h);const last=sample;if(last?.inside){const p=this.getTransform().transformPoint(new DOMPoint(x+w*.8,y+h*.6));last.pixel=[...this.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data];}return result;};return true})()`);
  const fixture=demoFixtures.find(f=>f.name===name);assert(fixture,`FixtureNotInDemo:${name}`);command('select','[data-role=fixture-picker]',fixture.id);clickBrowserTarget({command,evaluate},'.hwp-demo-picker > button');
  command('wait','--fn',`document.querySelector('h1')?.textContent.includes(${JSON.stringify(name)})&&window.__colors.length>0`);
  Object.assign(row,evaluate(`(()=>{const fills=window.__colors,chromatic=f=>/^#[0-9a-f]{6}$/i.test(f.color)&&!(f.color.slice(1,3)===f.color.slice(3,5)&&f.color.slice(3,5)===f.color.slice(5,7));return {title:document.querySelector('h1').textContent,status:document.querySelector('.hwp-demo-statusbar')?.innerText,colors:[...new Set(fills.filter(chromatic).map(f=>f.color))],fills:fills.filter(chromatic),scope:'first visible viewport fillRect calls and immediate fill pixels; not all document colors or Hancom parity'};})()`));
  command('screenshot',join(output,name+'.png'));row.opened=true;
 }catch(error){row.error=String(error);}
 console.log(JSON.stringify({name,opened:row.opened??false,colors:row.colors,error:row.error}));
 await writeFile(join(output,'result.json'),JSON.stringify({origin,cases,cleanup},null,2));
}}finally{await closeOwnedBrowser(command);cleanup={inactive:command('session','info').active===false};await writeFile(join(output,'result.json'),JSON.stringify({origin,cases,cleanup},null,2));}
console.log(JSON.stringify({output,cases:cases.length,opened:cases.filter(r=>r.opened).length,cleanup}));
