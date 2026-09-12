import {integer,textBodyWire} from './chart-text-body-oracle.mjs';
const number=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt('0x'+n.bitsHex));return b;};
const string=s=>Buffer.concat([...[s.id,s.hex.length/2,s.trailer,Number(s.introduced)].map(n=>integer(n)),Buffer.from(s.hex,'hex')]);
export function valueBlockCase(bytes,result,prior){
 const p=result.value.prefix,t=result.value.text,start=p.valueStart,body=Buffer.from(bytes.subarray(start,t.end));
 const types=new Map(prior.types),strings=new Map(prior.strings),numbers=new Map(prior.numbers);
 for(const d of result.axis.declarations)types.set(d.id,{name:d.name,version:d.version});
 for(const s of [result.axis.fontName,result.axis.text])if(s)strings.set(s.id,s);
 const fields=[p.reference?.kind==='number'?null:p.reference,p.format?.code,p.label,t.fontName,t.text].filter(Boolean);
 const per=Math.max(0,...fields.map(s=>s.hex.length/2)),total=fields.reduce((n,s)=>n+s.hex.length/2,0);
 const stored=[...strings.values()].reduce((n,s)=>n+s.hex.length/2,0)+fields.filter(s=>s.introduced).reduce((n,s)=>n+s.hex.length/2,0);
 const objects=strings.size+numbers.size+fields.filter(s=>s.introduced).length+Number(p.reference?.kind==='number'&&p.reference.introduced)+Number(p.format!==null)+1+(t.background?3:0);
 const scope=[];
 for(const [id,v] of types){const raw=Buffer.from(v.name,'latin1');scope.push(integer(id),integer(raw.length,2),raw,integer(v.version,2));}
 for(const [id,v] of strings){const raw=Buffer.from(v.hex,'hex');scope.push(integer(id),integer(raw.length),raw,integer(v.trailer,1));}
 for(const [id,v] of numbers)scope.push(integer(id),number(v),integer(v.trailer,2));
 const seed=Buffer.concat(scope);
 const input=(data=body,limits={})=>Buffer.concat([...[limits.per??per,limits.total??total,limits.objects??objects,limits.stored??stored,types.size,strings.size,numbers.size].map(n=>integer(n)),seed,data]);
 const out=[...[p.headerWord,p.rawBeforeLabel,t.end-start,Number(p.format!==null)].map(n=>integer(n)),Buffer.from(result.value.rawSuffix,'hex')];
 if(!p.reference)out.push(integer(0));
 else if(p.reference.kind==='number'){const r=p.reference;out.push(...[2,r.id,r.trailer,Number(r.introduced)].map(n=>integer(n)),number(r));}
 else out.push(integer(1),string(p.reference));
 if(p.format){const f=p.format;out.push(...[f.headerWord,f.rawWord,f.end-start].map(n=>integer(n)),string(f.code));}
 out.push(string(p.label),textBodyWire(t,start,objects,stored));
 return {body,start,input,wire:Buffer.concat(out),per,total,objects,stored};
}
