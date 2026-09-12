// Expected wire derives from independent observation, never product output.
export const integer=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
export function textFormatCase(bytes,result,priorTypes){
 const f=result.value.prefix.format,types=new Map(priorTypes);
 for(const d of [...result.axis.declarations,...result.value.prefix.declarations])if(d.nameOffset<f.start)types.set(d.id,{name:d.name,version:d.version});
 const declarations=[];
 for(const [id,v] of types){const raw=Buffer.from(v.name,'latin1');declarations.push(integer(id),integer(raw.length,2),raw,integer(v.version,2));}
 const seed=Buffer.concat(declarations),body=Buffer.from(bytes.subarray(f.start,f.end)),raw=Buffer.from(f.code.hex,'hex');
 const input=(data=body,options={})=>{
  const alias=options.alias??false;
  return Buffer.concat([...[options.per??raw.length,options.count??2,options.stored??raw.length,types.size,Number(alias)].map(n=>integer(n)),seed,...(alias?[integer(f.code.id),integer(raw.length),raw,integer(f.code.trailer,1)]:[]),data]);
 };
 const wire=(data=body,options={})=>Buffer.concat([...[f.headerWord,options.word??f.rawWord,f.code.id,raw.length,f.code.trailer,Number(!(options.alias??false)),data.length,2,raw.length].map(n=>integer(n)),raw]);
 return {f,body,raw,input,wire};
}
