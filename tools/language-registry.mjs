import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {alpha2History,historyTable} from './language-history.mjs';
import {registryDate} from './language-date.mjs';
export const sources={subtags:'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',extensions:'https://www.iana.org/assignments/language-tag-extensions-registry/language-tag-extensions-registry'};
export function records(raw){return raw.split(/^%%\r?$/m).filter(s=>s.trim()).map(block=>{
  const fields={};let key;
  for(const line of block.trim().split(/\r?\n/)){if(/^[ \t]/.test(line)){assert.ok(key);fields[key][fields[key].length-1]+=' '+line.trim();continue;}
    const m=/^([A-Za-z0-9_-]+): (.*)$/.exec(line);assert.ok(m,'bad registry field');key=m[1];(fields[key]??=[]).push(m[2]);}
  return fields;
});}
const one=(r,key)=>{assert.equal(r[key]?.length,1,`missing or duplicate ${key}`);return r[key][0];};
export function catalog(subtags,extensions){
  const groups={language:[],script:[],region:[],variant:[]},extlang={},counts={};
  const sr=records(subtags),er=records(extensions),date=one(sr.shift(),'File-Date'),extension_date=one(er.shift(),'File-Date');
  registryDate(date);registryDate(extension_date);
  for(const r of sr){const type=one(r,'Type');counts[type]=(counts[type]??0)+1;
    if(Object.hasOwn(groups,type))groups[type].push(one(r,'Subtag').toLowerCase());
    else if(type==='extlang'){const key=one(r,'Subtag').toLowerCase();assert.ok(!Object.hasOwn(extlang,key));extlang[key]=one(r,'Prefix').toLowerCase();assert.match(key,/^[a-z]{3}$/);assert.match(extlang[key],/^[a-z]{2,3}$/);}
    else assert.ok(['grandfathered','redundant'].includes(type));
  }
  for(const type of Object.keys(groups)){assert.equal(new Set(groups[type]).size,groups[type].length);groups[type]=groups[type].sort().join(' ');}
  const identifiers=er.map(r=>one(r,'Identifier').toLowerCase()).sort();assert.equal(new Set(identifiers).size,identifiers.length);identifiers.forEach(i=>assert.match(i,/^[0-9a-wy-z]$/));
  return {date,extension_date,sources,sha256:{subtags:createHash('sha256').update(subtags).digest('hex'),extensions:createHash('sha256').update(extensions).digest('hex')},record_counts:counts,alpha2_history:alpha2History(sr),...groups,extlang:Object.fromEntries(Object.entries(extlang).sort()),extensions:identifiers.join(' ')};
}
export function expand(value){
  if(!value.includes('..')){assert.match(value,/^[a-z0-9]{1,8}$/);return [value];}
  const [first,last,...extra]=value.split('..');assert.equal(extra.length,0);assert.equal(first.length,last.length);assert.ok(first.length>=1&&first.length<=8);
  const alphabet=/^[0-9]+$/.test(first)?'0123456789':'abcdefghijklmnopqrstuvwxyz';
  const ordinal=s=>[...s].reduce((n,c)=>{const i=alphabet.indexOf(c);assert.ok(i>=0);return n*alphabet.length+i;},0);
  const start=ordinal(first),end=ordinal(last);assert.ok(end>=start&&end-start<100000);
  return Array.from({length:end-start+1},(_,i)=>{let n=start+i,out='';for(let j=0;j<first.length;j++){out=alphabet[n%alphabet.length]+out;n=Math.floor(n/alphabet.length);}assert.equal(n,0);return out;});
}
export function tables(c){
  registryDate(c.date);registryDate(c.extension_date);
  for(const [key,prefix] of Object.entries(c.extlang)){assert.match(key,/^[a-z]{3}$/);assert.match(prefix,/^[a-z]{2,3}$/);}
  const identifiers=c.extensions.split(' ');assert.equal(new Set(identifiers).size,identifiers.length);
  for(const identifier of identifiers)assert.match(identifier,/^[0-9a-wy-z]$/);
  const files={},registered={};
  const patterns={language:/^[a-z]{2,8}$/,script:/^[a-z]{4}$/,region:/^(?:[a-z]{2}|[0-9]{3})$/,variant:/^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/};
  for(const type of Object.keys(patterns)){const values=c[type].split(' ').flatMap(expand).sort();assert.equal(new Set(values).size,values.length);for(const value of values)assert.match(value,patterns[type]);registered[type]=new Set(values);files[`${type}.txt`]=values.map(s=>s.padEnd(8,'!')).join('\n')+'\n';}
  files['alpha2_history.zig']=historyTable(c.alpha2_history,registered);
  files['extlang.txt']=Object.entries(c.extlang).sort().map(([k,v])=>k.padEnd(8,'!')+v.padEnd(8,'!')).join('\n')+'\n';
  files['extensions.txt']=c.extensions.split(' ').sort().map(s=>s.padEnd(8,'!')).join('\n')+'\n';
  files['dates.zig']=`// Generated from pinned IANA catalog. No network during builds.\npub const subtags = "${c.date}";\npub const extensions = "${c.extension_date}";\n`;
  return files;
}
async function download(url){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);assert.ok(response.url.startsWith('https://www.iana.org/assignments/'));const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;assert.ok(total<=2*1024*1024);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const mode=process.argv[2],base=new URL('../src/text/bcp47/data/',import.meta.url);
  if(mode==='--fetch'){const [s,e]=await Promise.all([download(sources.subtags),download(sources.extensions)]);process.stdout.write(JSON.stringify(catalog(s,e)));}
  else{assert.ok(['--tables','--check'].includes(mode));const c=JSON.parse(readFileSync(new URL('source.json',base),'utf8')),files=tables(c);
    if(mode==='--tables')process.stdout.write(JSON.stringify(files));else{for(const [name,value] of Object.entries(files))assert.equal(readFileSync(new URL(name,base),'utf8'),value,name);console.log(JSON.stringify({registryDate:c.date,extensionDate:c.extension_date,tables:Object.keys(files).length}));}}
}
