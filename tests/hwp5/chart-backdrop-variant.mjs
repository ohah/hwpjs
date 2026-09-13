// Caller supplies independently observed declaration and base positions.
export function backdropRawVariant(bytes,start,backdrop){
 const b=Buffer.from(bytes);
 b.fill(0x5a,start,start+26);
 for(const [i,d] of backdrop.declarations.entries())b.fill(0xa5,d.versionOffset+2,d.versionOffset+2+[50,34,4][i]);
 b.writeUInt16LE(65535,backdrop.bases[0]+4);
 return b;
}
