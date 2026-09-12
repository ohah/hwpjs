// Selected layout hypothesis: caller supplies the observed Axis raw +6 word.
// Raw fields have no asserted API meaning. No marker scan or offset retry.
export function observeAxisTail(bytes,offset,selector,types){
 const b=Buffer.from(bytes);
 if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 if(selector!==0&&selector!==1)throw Error('UnsupportedAxisTailLayout');
 let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteAxisTail');const r=b.subarray(p,p+n);p+=n;return r;};
 const prefix=take(36).toString('hex'),extra=selector===1?take(24).toString('hex'):null,suffix=take(14).toString('hex');
 const baseOffset=p,baseTypeId=take(4).readUInt32LE(),base=types.get(baseTypeId);
 if(base?.name!=='VtObject\0'||base.version!==1)throw Error('UnsupportedAxisTailType');
 return {start:offset,selector,prefix,extra,suffix,baseOffset,baseTypeId,end:p};
}
