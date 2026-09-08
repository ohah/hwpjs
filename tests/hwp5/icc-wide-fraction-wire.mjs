export function readWide(bytes,offset,width=32){let value=0n;for(let i=width/8-1;i>=0;i--)value=(value<<64n)|bytes.readBigUInt64LE(offset+i*8);return value;}
export function writeUnsigned(bytes,offset,value,width=32){for(let i=width/8-1;i>=0;i--){bytes.writeBigUInt64BE(value&((1n<<64n)-1n),offset+i*8);value>>=64n;}if(value!==0n)throw Error('Wide wire overflow');}
