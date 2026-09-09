import assert from 'node:assert/strict';
const words=values=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeUInt32LE(v,i*4));return b;};
export {words as gifWords};

// Independent full-string dictionary and bit offsets, not the Zig prefix/stack decoder.
export function gifLzw(bytes,minimum,pixels,paletteEntries,maxCodes=268435456) {
  assert.ok(minimum>=2&&minimum<=8);
  const clear=2**minimum,end=clear+1;let dict,width,next,previous=null,bit=0,codes=0,clears=0,maximum=minimum+1,initial=false;
  const reset=()=>{dict=Array.from({length:clear},(_,i)=>[i]);next=clear+2;width=minimum+1;previous=null;};reset();
  const output=[];
  for(;;) {
    assert.ok(codes<maxCodes,'code limit');
    assert.ok(bit+width<=bytes.length*8,'missing EOI');
    let code=0;for(let i=0;i<width;i++,bit++)code+=((bytes[bit>>3]>>(bit&7))&1)*2**i;
    if(!codes)initial=code===clear;codes++;maximum=Math.max(maximum,width);
    if(code===clear){clears++;reset();continue;}
    if(code===end){assert.equal(Math.ceil(bit/8),bytes.length,'trailing LZW');break;}
    let phrase;
    if(code<clear)phrase=[code];
    else if(code<next)phrase=dict[code];
    else if(code===next&&previous!==null)phrase=[...previous,previous[0]];
    assert.ok(phrase,'invalid LZW code');
    for(const index of phrase){assert.ok(!paletteEntries||index<paletteEntries);assert.ok(output.length<pixels);output.push(index);}
    if(previous!==null&&next<4096){dict[next++]=[...previous,phrase[0]];width=Math.min(12,Math.floor(Math.log2(next))+1);}
    previous=phrase;
  }
  assert.equal(output.length,pixels,'incomplete raster');
  return {indices:Buffer.from(output),codes,clears,maximum,bytes:Math.ceil(bit/8),initial};
}

export function gifOracle(input,options={}) {
  const {trailing=false}=options;
  const b=Buffer.from(input);let p=0,blocks=0,subBlocks=0,pending=null,comments=0,apps=0,texts=0,reserved=0,totalPixels=0,totalCodes=0,unresolved=0;
  assert.ok(b.length<=(options.bytes??67108864));
  const take=n=>{assert.ok(n<=b.length-p,'truncated block');const x=b.subarray(p,p+n);p+=n;return x;};
  const byte=()=>take(1)[0],u16=()=>take(2).readUInt16LE();
  const magic=take(6).toString('latin1');assert.ok(magic==='GIF89a'||magic==='GIF87a');
  const version=magic==='GIF89a'?89:87,width=u16(),height=u16(),flags=byte(),background=byte(),aspect=byte();
  assert.ok(version===89||!(flags&8)&&!aspect);
  const palette=f=>take(f&128?3*2**((f&7)+1):0);
  const global=palette(flags),frames=[];
  const chunks=()=>{const parts=[];for(let n=byte();n;n=byte()){parts.push(take(n));subBlocks++;assert.ok(subBlocks<=(options.subBlocks??1000000));}return Buffer.concat(parts);};
  for(;;){
    const marker=byte();blocks++;
    assert.ok(blocks<=(options.blocks??100000));
    if(marker===59){assert.equal(pending,null);assert.ok(trailing||p===b.length);break;}
    if(marker===44){
      const left=u16(),top=u16(),w=u16(),h=u16(),f=byte();assert.ok(!(f&24));assert.ok(version===89||!(f&32));assert.ok(left+w<=width&&top+h<=height);
      const local=palette(f),minimum=byte(),data=chunks(),colors=local.length?local:global;
      assert.ok(frames.length<(options.frames??10000));assert.ok(w*h<=(options.pixels??268435456)-totalPixels);
      const lzw=gifLzw(data,minimum,w*h,colors.length/3,(options.codes??268435456)-totalCodes),indices=Buffer.alloc(w*h);
      const rows=Array.from({length:h},(_,i)=>i);
      if(f&64)rows.sort((a,b)=>{const pass=y=>y%8===0?0:y%8===4?1:y%4===2?2:3;return pass(a)-pass(b)||a-b;});
      rows.forEach((row,i)=>lzw.indices.copy(indices,row*w,i*w,(i+1)*w));
      frames.push({left,top,width:w,height:h,flags:f,local,minimum,control:pending,lzw,indices,colors});pending=null;
      totalPixels+=indices.length;totalCodes+=lzw.codes;unresolved+=Number(colors.length===0);continue;
    }
    assert.equal(marker,33);assert.equal(version,89);const label=byte();
    if(label===249){assert.equal(pending,null);assert.equal(byte(),4);const f=byte();assert.ok(!(f&224));pending={flags:f,delay:u16(),transparent:byte()};assert.equal(byte(),0);reserved+=Number(((f>>2)&7)>=4);}
    else if(label===254){chunks();comments++;}
    else if(label===255){assert.equal(byte(),11);take(11);chunks();apps++;}
    else if(label===1){assert.equal(byte(),12);take(12);chunks();texts++;pending=null;}
    else assert.fail('unknown extension');
  }
  const parts=[words([version,width,height,flags,background,aspect,global.length,frames.length,blocks,subBlocks,totalPixels,totalCodes,comments,apps,texts,unresolved,reserved,p,b.length-p,1]),global];
  for(const f of frames){const c=f.control,l=f.lzw;parts.push(words([f.left,f.top,f.width,f.height,f.flags,f.local.length,f.minimum,Number(c!==null),c?.flags??0,c?.delay??0,c?.transparent??0,f.indices.length,l.codes,l.clears,l.maximum,l.bytes,Number(l.initial),Number(f.colors.length!==0)]),f.local,f.indices);}
  return {wire:Buffer.concat(parts),frames,width,height};
}
