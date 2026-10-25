// Display-only effects verified against independent image/PDF pixels.
const TABLE_IMAGE_TONES=Object.freeze(["brightness10","grayscale601"]);
export function validTableImageTone(tone){return TABLE_IMAGE_TONES.includes(tone);}
export function applyTableImageTone(pixels,tone){
 if(!validTableImageTone(tone))throw Error("UnsupportedTableImageTone");
 if(!(pixels instanceof Uint8ClampedArray)||pixels.length%4)throw Error('InvalidTableImagePixels');
 const output=new Uint8ClampedArray(pixels);
 for(let i=0;i<output.length;i+=4){
  if(tone==="brightness10")for(let c=0;c<3;c++)output[i+c]=Math.min(255,output[i+c]+25);
  else {const gray=Math.floor((299*output[i]+587*output[i+1]+114*output[i+2])/1000);output[i]=gray;output[i+1]=gray;output[i+2]=gray;}
 }
 return output;
}
export async function decodeTableImageTone(bytes,tone,{decode,createSurface,maxPixels=16000000}){
 if(!validTableImageTone(tone))throw Error("UnsupportedTableImageTone");
 if(!(bytes instanceof Uint8Array)||typeof decode!=='function'||typeof createSurface!=='function'||!Number.isSafeInteger(maxPixels)||maxPixels<1)throw Error('InvalidTableImageToneDecoder');
 const source=await decode(bytes);let surface;
 try{
  const {width,height}=source;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>maxPixels/height)throw Error('TableImageTonePixelLimitExceeded');
  surface=createSurface(width,height);
  const ctx=surface.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('TableImageToneContextUnavailable');
  ctx.drawImage(source,0,0);
  const image=ctx.getImageData(0,0,width,height);
  if(image.data.length!==width*height*4)throw Error('InvalidTableImagePixelCount');
  image.data.set(applyTableImageTone(image.data,tone));ctx.putImageData(image,0,0);
  return surface.transferToImageBitmap();
 }finally{
  source.close();
  if(surface){surface.width=0;surface.height=0;}
 }
}

export function applyTableImageTone10(pixels){return applyTableImageTone(pixels,"brightness10");}
export function decodeTableImageTone10(bytes,options){return decodeTableImageTone(bytes,"brightness10",options);}
