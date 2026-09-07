// Read-only external evidence adapter, not the Zig XML parser or a schema validator.
import {spawnSync} from 'node:child_process';
export function prepareXml(bytes,maxBytes=16*1024*1024) {
  if(!Buffer.isBuffer(bytes))throw new TypeError('Expected XML byte buffer');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw new RangeError('Invalid XML byte limit');
  if(bytes.length>maxBytes)throw Error('XmlByteLimitExceeded');
  if(bytes.length%2)throw Error('InvalidXmlUtf16');
  const text=bytes.toString('utf16le');
  if(!text.isWellFormed())throw Error('InvalidXmlUtf16');
  // Conservative whole-text guard, including occurrences in comments/CDATA.
  // Reject before spawning: --nonet alone does not block local-file entities.
  if(text.includes('<!DOCTYPE'))throw Error('XmlDoctypeDeferred');
  return bytes[0]===255&&bytes[1]===254?Buffer.from(bytes):Buffer.concat([Buffer.from([255,254]),bytes]);
}
export function queryXml(bytes,expression,{maxBytes=16*1024*1024,maxOutput=1024*1024,timeoutMs=5000,run=spawnSync}={}) {
  if(!Number.isSafeInteger(maxOutput)||maxOutput<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new RangeError('Invalid XML process limits');
  const input=prepareXml(bytes,maxBytes);
  const result=run('xmllint',['--nonet','--xpath',expression,'-'],{input,maxBuffer:maxOutput,timeout:timeoutMs,encoding:'buffer'});
  // Do not print parser stderr: it may contain the user's document text.
  if(result.error||result.signal||result.status!==0)throw Error('XmlProcessFailed');
  // libxml can report namespace errors with status 0. Evidence requires clean
  // diagnostics; warnings are inconclusive too, not proof of an invalid document.
  if(result.stderr!=null&&(!Buffer.isBuffer(result.stderr)||result.stderr.length!==0))throw Error('XmlProcessDiagnostic');
  if(!Buffer.isBuffer(result.stdout)||result.stdout.length>maxOutput)throw Error('XmlOutputLimitExceeded');
  return result.stdout.toString('utf8').trim();
}
// These are unnamespaced element-name counts, NOT DiffML command counts.
const names=['elements','pathAttributes','updateElements','positionElements','deleteElements','insertElements','oldAttributes'];
const expression="concat(name(/*),'|',count(//*),'|',count(//@PATH),'|',count(//UPDATE),'|',count(//POSITION),'|',count(//DELETE),'|',count(//INSERT),'|',count(//@OLD))";
export function inspectXml(bytes,options) {
  const [root,...counts]=queryXml(bytes,expression,options).split('|');
  // XML names are owned by the external XML parser, not an ASCII regex here.
  if(!root||counts.length!==names.length||counts.some(n=>!/^\d+$/.test(n)||!Number.isSafeInteger(Number(n))))throw Error('InvalidXmlEvidenceOutput');
  return {root,...Object.fromEntries(names.map((name,i)=>[name,Number(counts[i])]))};
}
