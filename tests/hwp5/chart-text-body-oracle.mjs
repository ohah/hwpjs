// Independent observed fields, not product serializer output.
export const integer=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
export function textBodyCase(bytes,result,prior){
 const types=new Map(prior.types),strings=new Map(prior.strings),numbers=new Map(prior.numbers);
 for(const d of [...result.axis.declarations,...result.value.prefix.declarations])types.set(d.id,{name:d.name,version:d.version});
 for(const s of [result.axis.fontName,result.axis.text,result.value.prefix.reference,result.value.prefix.format?.code,result.value.prefix.label])if(s){if(s.kind==='number')numbers.set(s.id,s);else strings.set(s.id,s);}
 const t=result.value.text,name=t.fontName,text=t.text,start=t.start,body=Buffer.from(bytes.subarray(start,t.end));
 const nameBytes=Buffer.from(name.hex,'hex'),textBytes=Buffer.from(text?.hex??'','hex');
 const per=Math.max(nameBytes.length,textBytes.length),total=nameBytes.length+textBytes.length;
 const objects=strings.size+numbers.size+1+Number(name.introduced)+Number(text?.introduced??false)+(t.background?3:0);
 const stored=[...strings.values()].reduce((n,s)=>n+s.hex.length/2,0)+(name.introduced?nameBytes.length:0)+(text?.introduced?textBytes.length:0);
 const scope=[];
 for(const [id,v] of types){const raw=Buffer.from(v.name,'latin1');scope.push(integer(id),integer(raw.length,2),raw,integer(v.version,2));}
 for(const [id,v] of strings){const raw=Buffer.from(v.hex,'hex');scope.push(integer(id),integer(raw.length),raw,integer(v.trailer,1));}
 for(const id of numbers.keys())scope.push(integer(id));
 const seed=Buffer.concat(scope);
 const input=(data=body,limits={})=>Buffer.concat([...[limits.per??per,limits.total??total,limits.objects??objects,limits.stored??stored,types.size,strings.size,numbers.size].map(n=>integer(n)),seed,data]);
 return {body,start,input,wire:textBodyWire(t,start,objects,stored),per,total,objects,stored,text:t};
}
export function textBodyWire(t,start,objects,stored){
 const name=t.fontName,text=t.text,nameBytes=Buffer.from(name.hex,'hex'),textBytes=Buffer.from(text?.hex??'','hex');
 const out=[...[t.end-start,t.fontId,name.id,nameBytes.length,name.trailer,Number(name.introduced),Number(text!==null),text?.id??0xffffffff,textBytes.length,text?.trailer??0,Number(text?.introduced??false),Number(t.background!==null),objects,stored].map(n=>integer(n))];
 for(const size of [12,14,24,26])out.push(Buffer.from(t.rawFields.find(r=>r.n===size).hex,'hex'));
 if(t.background){out.push(...t.background.ids.map(n=>integer(n)),integer(t.backgroundEnd-start),integer(t.background.suffix,2));for(const size of [50,34,4])out.push(Buffer.from(t.rawFields.find(r=>r.n===size).hex,'hex'));}
 out.push(nameBytes,textBytes);
 return Buffer.concat(out);
}
