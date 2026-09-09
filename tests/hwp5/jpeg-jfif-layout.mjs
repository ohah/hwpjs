import assert from 'node:assert/strict';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
import {jpegJfifFixture,jpegJfifOracle} from './jpeg-jfif.mjs';
import {jpegJfxxFixture,jpegJfxxOracle} from './jpeg-jfxx.mjs';
import {jpegJfxxJpegFixture} from './jpeg-jfxx-jpeg.mjs';
import {segment} from './jpeg-structure.mjs';

// Collect marker ordinals first; verify positions by array relationships rather
// than reproducing the product's streaming phase machine.
function markerList(raw) {
  let at=0,entropy=false;const result=[];
  while(at<raw.length) {
    if(entropy)at+=jpegEntropyOracle(raw.subarray(at)).consumed;
    const m=jpegMarkerOracle(raw.subarray(at));at+=m.consumed;
    result.push({code:m.code,payload:m.wire.subarray(20)});
    entropy=m.code===218||(m.code>=208&&m.code<=215);
    if(m.code===217){assert.equal(at,raw.length);return result;}
  }
  throw Error('Missing EOI');
}
const signature=(m,s)=>m.code===224&&m.payload.subarray(0,5).equals(Buffer.from(s+'\0'));
export function jpegJfifLayoutOracle(raw) {
  const list=markerList(raw);assert.equal(list[0].code,216);
  const headers=list.flatMap((m,i)=>signature(m,'JFIF')?[i]:[]);
  assert.deepEqual(headers,[1]);const h=list[1].payload;jpegJfifOracle(h);
  const extensions=list.flatMap((m,i)=>signature(m,'JFXX')?[i]:[]);
  assert.deepEqual(extensions,extensions.map((_,i)=>i+2));
  let unknown=0,compressed=0,apps=0;
  for(const i of extensions){const p=list[i].payload;jpegJfxxOracle(p);if(p[5]===16)compressed++;else if(![17,19].includes(p[5]))unknown++;}
  for(const m of list) {
    if(m.code>=224&&m.code<=239&&!signature(m,'JFIF')&&!signature(m,'JFXX')){apps++;if(m.code===224)assert.ok(m.payload.includes(0));}
    if(m.code>=192&&m.code<=207&&![196,200,204].includes(m.code)) {
      const p=m.payload;assert.equal(p[0],8);assert.ok([1,3].includes(p[5]));for(let i=0;i<p[5];i++)assert.equal(p[6+i*3],i+1);
    }
  }
  const values=[extensions.length,unknown,compressed,apps,h.readUInt16BE(5),h[7],h.readUInt16BE(8),h.readUInt16BE(10),h[12],h[13],list.length];
  const out=Buffer.alloc(44);values.forEach((n,i)=>out.writeUInt32LE(n,i*4));return out;
}
export function jpegJfifLayoutActual(call,raw){assert.deepEqual(call(265,raw),jpegJfifLayoutOracle(raw));return {markers:jpegJfifLayoutOracle(raw).readUInt32LE(40)};}
export function jpegJfifLayoutFixture(options={},extensions=[],apps=[]) {
  const raw=jpegJfxxJpegFixture(options);
  return Buffer.concat([raw.subarray(0,2),segment(224,jpegJfifFixture()),...extensions,...apps,raw.subarray(2)]);
}
export function jpegJfifLayoutEdges(call) {
  let comparisons=0,rejected=0;
  const check=raw=>{jpegJfifLayoutActual(call,raw);comparisons++;};
  const reject=(raw,error,limit=67108864)=>{assert.throws(()=>call(265,raw,limit),error);rejected++;};
  const jfif=segment(224,jpegJfifFixture()),xx=segment(224,jpegJfxxFixture(255)),app=segment(224,Buffer.from('acme\0'));
  for(let code=0;code<256;code++)check(jpegJfifLayoutFixture({},[segment(224,jpegJfxxFixture(code)),xx]));
  for(const width of [1,8,17])for(const height of [1,9,17])for(const restart of [0,1,3])for(const dnl of [false,true])check(jpegJfifLayoutFixture({width,height,restart,dnl}));
  for(let code=224;code<=239;code++)check(jpegJfifLayoutFixture({},[xx],[segment(code,Buffer.from('acme\0')),segment(code,Buffer.of(0))]));
  const good=jpegJfifLayoutFixture({},[xx]);
  reject(jpegJfxxJpegFixture({}),/MissingJfifHeader/);
  for(const before of [app,xx,segment(254,Buffer.alloc(0))])reject(Buffer.concat([good.subarray(0,2),before,good.subarray(2)]),/MissingJfifHeader/);
  // Insert at every marker boundary, including post-entropy EOI: the header
  // must never repeat and extensions must not resume after a non-extension.
  let at=0,entropy=false,index=0;
  while(at<good.length){
    if(entropy)at+=jpegEntropyOracle(good.subarray(at)).consumed;
    const start=at,m=jpegMarkerOracle(good.subarray(at));at+=m.consumed;
    if(index>=2){reject(Buffer.concat([good.subarray(0,start),jfif,good.subarray(start)]),/DuplicateJfifHeader/);if(index>3)reject(Buffer.concat([good.subarray(0,start),xx,good.subarray(start)]),/InvalidJfxxPosition/);}
    entropy=m.code===218||(m.code>=208&&m.code<=215);index++;if(m.code===217)break;
  }
  reject(jpegJfifLayoutFixture({},[xx,app,xx]),/InvalidJfxxPosition/);
  reject(jpegJfifLayoutFixture({},[],[segment(224,Buffer.from('acme'))]),/UnterminatedJfifApplicationId/);
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n));
  reject(Buffer.concat([good,Buffer.of(0)]),/TrailingJpegBytes/);
  reject(good,/LimitExceeded/,43);
  check(Buffer.concat([good.subarray(0,2),Buffer.of(255),good.subarray(2)]));
  return {comparisons,rejected};
}
