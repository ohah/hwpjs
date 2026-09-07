import {createHash} from 'node:crypto';
import {inspectRegistry} from './inspect.mjs';
export const urls=Object.freeze(Object.fromEntries(['cmm','manufacturer','device'].map(kind=>[kind,`https://registry.color.org/${kind}-signatures/${kind}-signatures.csv`])));
// Bounds are enforced while streaming, even without Content-Length.
export async function readBounded(response,maxBytes){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw Error('InvalidDownloadLimit');
  if(!response.ok){await response.body?.cancel();throw Error('RegistryHttpFailure');}
  if(!response.body)throw Error('MissingRegistryBody');
  const reader=response.body.getReader();let buffer=Buffer.alloc(0),total=0,finished=false;
  try{
    while(true){const {done,value}=await reader.read();if(done){finished=true;break;}
      if(value.byteLength>maxBytes-total)throw Error('RegistryDownloadLimit');
      if(value.byteLength===0)continue;
      const needed=total+value.byteLength;
      if(needed>buffer.length){const capacity=Math.max(needed,Math.min(maxBytes,Math.max(4096,buffer.length*2)));const next=Buffer.alloc(capacity);buffer.copy(next,0,0,total);buffer=next;}
      buffer.set(value,total);total=needed;
    }
    return buffer.subarray(0,total);
  }finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function fetchSnapshot({fetchImpl=fetch,maxBytes=4*1024*1024,timeoutMs=20000}={}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw Error('InvalidDownloadLimit');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('InvalidDownloadTimeout');
  const sources=[];
  for(const [kind,url] of Object.entries(urls)){
    const response=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
    const bytes=await readBounded(response,maxBytes),text=new TextDecoder('utf8',{fatal:true}).decode(bytes);
    const report=inspectRegistry(kind,text);
    sources.push({url,byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...report});
  }
  const manufacturers=new Set(sources[1].entries.map(e=>e[0]));
  const missingDeviceManufacturers=[...new Set(sources[2].entries.filter(e=>!manufacturers.has(e[0])).map(e=>e[0]))].sort((a,b)=>a-b);
  return {schemaVersion:1,sources,missingDeviceManufacturers};
}
