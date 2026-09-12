// Byte observations only: neither a path decoder nor a DocOptions validator.
import {digest,streamBytes} from './hwp-corpus-evidence.mjs';
export const optionStreamNames=Object.freeze(['_LinkDoc','DrmLicense','DrmRootSect','CertDrmHeader','CertDrmInfo','DigitalSignature','PublicKeyInfo']);
export function docOptionsEvidence(cfb) {
  const root=cfb.findExact('/DocOptions');
  if(root==null)return {state:'absent'};
  if(root.type!==1)return {state:'invalid_kind',kind:root.type};
  const nodes=cfb.document().nodes;
  // Exact identity from the authoritative CFB lookup, not a second Unicode fold.
  const index=nodes.findIndex(n=>n.parent===0&&n.name===root.name);
  if(index<0)throw new Error('MissingDocOptionsSnapshot');
  const streams={};
  const recognized=new Set();
  for(const name of optionStreamNames){
    const entry=cfb.findExact('/DocOptions/'+name);
    if(entry==null)continue;
    recognized.add(entry.name);
    if(entry.type!==2){streams[name]={state:'invalid_kind',kind:entry.type};continue;}
    const raw=streamBytes(entry);
    streams[name]={state:'stream',bytes:raw.length,sha256:digest(raw),fieldsValidated:false,...(name==='_LinkDoc'?{observed:linkDocEvidence(raw)}:{})};
  }
  const unknownChildren=nodes.filter(n=>n.parent===index&&!recognized.has(n.name)).length;
  return {state:'storage',unknownChildren,streams};
}
export function linkDocEvidence(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('ExpectedLinkDocBytes');
  const bytes=Buffer.from(input);
  let firstZeroWord=null,nonzeroBytes=0;
  for(const byte of bytes)nonzeroBytes+=Number(byte!==0);
  for(let at=0;at+1<bytes.length;at+=2)if(bytes.readUInt16LE(at)===0){firstZeroWord=at;break;}
  return {
    bytes:bytes.length,
    empty:bytes.length===0,
    allZero:bytes.length>0&&nonzeroBytes===0,
    nonzeroBytes,
    firstWord:bytes.length>=2?bytes.readUInt16LE(0):null,
    firstZeroWord,
    nonzeroAfterFirstZeroWord:firstZeroWord!==null&&bytes.subarray(firstZeroWord+2).some(n=>n!==0),
    oddBytes:bytes.length%2,
    fieldsValidated:false,
  };
}
