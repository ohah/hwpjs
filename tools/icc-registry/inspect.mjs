import {parseCsv} from './csv.mjs';
export const issueReasons=Object.freeze(['InvalidRegistryHex','InvalidRegistryAscii','RegistrySignatureMismatch','ZeroRegistrySignature','InvalidRegistryId','InvalidRegistryAsciiQuotes','DuplicateRegistryEntry']);
const schemas={cmm:['Vendor','Hex value','ASCII','Date','Description'],manufacturer:['ID','Company Name','First Name','Last Name','Address1','Address2','City','State','Country','Phone','Email Address','Comments'],device:['Device ID','Manufacturer ID','Company Name','First Name','Last Name','Email Address','Model Name','Comments']};
function signature(hex,ascii){
  if(!/^[\da-f]{8}h?$/i.test(hex))throw Error('InvalidRegistryHex');
  const bytes=Buffer.from(hex.slice(0,8),'hex');
  if(ascii.length<1||ascii.length>4||!/^[\x20-\x7e]+$/.test(ascii))throw Error('InvalidRegistryAscii');
  if(bytes.toString('latin1')!==ascii.padEnd(4,' '))throw Error('RegistrySignatureMismatch');
  const value=bytes.readUInt32BE();if(value===0)throw Error('ZeroRegistrySignature');return value;
}
function id(value){const m=/^(.*)-([\da-f]{8})$/i.exec(value);if(!m)throw Error('InvalidRegistryId');return signature(m[2],m[1]);}
// Output contains no company contacts, addresses, personal names or descriptions.
// Bad/ambiguous rows are quarantined, never silently mapped to a signature.
export function inspectRegistry(kind,text){
  if(!Object.hasOwn(schemas,kind))throw Error('InvalidRegistryKind');const schema=schemas[kind];
  const rows=parseCsv(text);if(!rows.length||JSON.stringify(rows[0])!==JSON.stringify(schema))throw Error('InvalidRegistrySchema');
  const entries=[],issues=[],seen=new Set();
  for(let i=1;i<rows.length;i++){
    const row=rows[i];if(row.length!==schema.length)throw Error('InvalidRegistryRowWidth');
    const ids=kind==='cmm'?row.slice(1,3):row.slice(0,kind==='device'?2:1);
    let entry;
    try{
      if(kind==='cmm'){const quoted=/^'(.*)'$/.exec(row[2]);if(!quoted)throw Error('InvalidRegistryAsciiQuotes');entry=[signature(row[1],quoted[1])];}
      else if(kind==='manufacturer')entry=[id(row[0])];else entry=[id(row[1]),id(row[0])];
    }catch(e){if(!issueReasons.includes(e.message))throw e;issues.push({row:i+1,reason:e.message,ids});continue;}
    const key=entry.join(':');if(seen.has(key)){issues.push({row:i+1,reason:'DuplicateRegistryEntry',ids});continue;}seen.add(key);entries.push(entry);
  }
  entries.sort((a,b)=>a[0]-b[0]||(a[1]??0)-(b[1]??0));
  return {kind,sourceRows:rows.length-1,entries,issues,complete:issues.length===0};
}
