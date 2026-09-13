// Fixed observed corpus positions, opaque words deliberately not object IDs.
export function gridPreludeRawVariant(b){
 const raw=Buffer.from(b);raw.fill(0xa5,0,32);
 raw.writeUInt32LE(0xffffffff,36);raw.writeUInt32LE(42,56);raw.writeUInt16LE(65535,117);
 return raw;
}
