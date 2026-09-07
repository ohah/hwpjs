import test from 'node:test';import assert from 'node:assert/strict';import {readBounded,fetchSnapshot,urls} from './download.mjs';
test('Bounded stream handles exact zero limits and cancellation',async()=>{
  assert.deepEqual(await readBounded(new Response('abc'),3),Buffer.from('abc'));
  assert.equal((await readBounded(new Response(''),0)).length,0);
  let cancelled=false;
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4]));},cancel(){cancelled=true;}});
  await assert.rejects(readBounded(new Response(body),3),/RegistryDownloadLimit/);assert.equal(cancelled,true);assert.equal(body.locked,false);
  await assert.rejects(readBounded(new Response('x'),0),/RegistryDownloadLimit/);
  await assert.rejects(readBounded(new Response('x'),-1),/InvalidDownloadLimit/);
  await assert.rejects(readBounded(new Response('bad',{status:500}),10),/RegistryHttpFailure/);
  await assert.rejects(readBounded(new Response(null),10),/MissingRegistryBody/);
});
test('Fragmented streams preserve bytes without retaining per-chunk storage',async()=>{
  let sent=0;const count=100000;
  const body=new ReadableStream({pull(c){if(sent===count){c.close();return;}if(sent%17===0)c.enqueue(new Uint8Array(0));c.enqueue(new Uint8Array([sent++%256]));}});
  const out=await readBounded(new Response(body),count);assert.equal(out.length,count);assert.equal(body.locked,false);
  assert.deepEqual(out,Buffer.from(Array.from({length:count},(_,i)=>i%256)));
  // Spare capacity is never observable as result bytes.
  assert.deepEqual(await readBounded(new Response(new Uint8Array([255,0,1])),4096),Buffer.from([255,0,1]));
});
const csv={cmm:"Vendor,Hex value,ASCII,Date,Description\nPrivate,41424320,'ABC ',,secret\n",manufacturer:'ID,Company Name,First Name,Last Name,Address1,Address2,City,State,Country,Phone,Email Address,Comments\nABC -41424320,,,,,,,,,,,\n',device:'Device ID,Manufacturer ID,Company Name,First Name,Last Name,Email Address,Model Name,Comments\nTEST-54455354,ABC -41424320,,,,,,\n'};
test('Snapshot strips contacts and retains sources hashes and parent relationships',async()=>{
  const calls=[];const snapshot=await fetchSnapshot({fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);return new Response(csv[Object.keys(urls).find(k=>urls[k]===url)]);}});
  assert.deepEqual(calls,Object.values(urls));assert.equal(snapshot.sources.length,3);assert.equal(snapshot.sources[0].sha256.length,64);assert.equal(snapshot.sources[0].byteLength,Buffer.byteLength(csv.cmm));assert.deepEqual(snapshot.missingDeviceManufacturers,[]);assert.ok(!JSON.stringify(snapshot).includes('secret'));assert.ok(!JSON.stringify(snapshot).includes('Private'));
});
test('Snapshot fails atomically on HTTP, malformed UTF8 and invalid quotas',async()=>{
  await assert.rejects(fetchSnapshot({fetchImpl:async()=>new Response(new Uint8Array([255]))}),TypeError);
  await assert.rejects(fetchSnapshot({fetchImpl:async()=>new Response('',{status:403})}),/RegistryHttpFailure/);
  await assert.rejects(fetchSnapshot({maxBytes:-1}),/InvalidDownloadLimit/);await assert.rejects(fetchSnapshot({timeoutMs:0}),/InvalidDownloadTimeout/);
  let calls=0;await assert.rejects(fetchSnapshot({fetchImpl:async()=>new Response(++calls===1?csv.cmm:'bad')}),/InvalidRegistrySchema/);assert.equal(calls,2);
});
