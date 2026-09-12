import assert from 'node:assert/strict';
const names=['VtChart\0','VtDataGrid\0','VtMatrix\0','VtCollection\0','VtObject\0'];
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};

// Research oracle for the selected corpus layout, not a product recognizer.
// Unlike the initial rejected hypothesis, slots include each null u32 and do
// not derive coordinates from object IDs. No marker search sets the cell end.
export function chartGridCellsOracle(b){
 let p=140;
 const take=n=>{assert.ok(p+n<=b.length);const r=b.subarray(p,p+n);p+=n;return r;};
 const word=()=>take(2).readUInt16LE(),long=()=>take(4).readUInt32LE();
 const types=new Map(names.map((name,id)=>[id,name])),objects=new Set(),cells=[];
 for(const [id,offset] of [40,60,79,96,119].entries())assert.equal(b.readUInt32LE(offset),id);
 const type=()=>{
  const id=long();if(types.has(id))return types.get(id);
  const name=take(word()).toString('latin1');assert.ok(name.endsWith('\0'));
  assert.equal(word(),1);types.set(id,name);return name;
 };
 const rows=b.readUInt16LE(136),columns=b.readUInt16LE(138),count=rows*columns;
 assert.ok(count<=1000000);
 let stringBytes=0,maxString=0;
 for(let slot=0;slot<count;slot++){
  const start=p,id=long();
  if(id===0xffffffff){cells.push({id,kind:0,start,end:p,trailer:0,raw:Buffer.alloc(0)});continue;}
  assert.ok(!objects.has(id));objects.add(id);
  const name=type(),payloadStart=p;let raw,trailer,kind;
  if(name==='VtString\0'){
   raw=take(word());trailer=take(1)[0];kind=1;stringBytes+=raw.length;maxString=Math.max(maxString,raw.length);
  }else{assert.equal(name,'VtDouble\0');raw=take(8);trailer=word();kind=2;}
  const valueBase=p;assert.equal(type(),'VtValue\0');const objectBase=p;assert.equal(type(),'VtObject\0');
  cells.push({id,kind,start,end:p,trailer,raw,payloadStart,valueBase,objectBase});
 }
 const wire=Buffer.concat([
  ...[rows,columns,cells.length,p,types.size,stringBytes].map(u32),
  ...cells.map(c=>Buffer.concat([...[c.id,c.kind,c.start,c.end,c.trailer,c.raw.length].map(u32),c.raw])),
 ]);
 return {rows,columns,cells,end:p,typeCount:types.size,stringBytes,maxString,wire,types};
}
