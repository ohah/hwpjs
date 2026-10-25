// Correlation and cancellation only; source identity and byte ownership stay native.
export function createImageByteRequests(post,{kind,field,prefix,timeoutError,invalidReply,documentChanged,strictIdentity=false},timeoutMs=30000){
 let sequence=0;const pending=new Map();
 return {
  read(section,node){
   const origin=`${prefix}:${++sequence}`;
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(origin);reject(new Error(timeoutError));},timeoutMs);
    pending.set(origin,{resolve,reject,timer,section,node});
    try{post({kind,section,[field]:node,origin});}catch(error){clearTimeout(timer);pending.delete(origin);reject(error);}
   });
  },
  message(message){
   if(!String(message.origin??"").startsWith(`${prefix}:`))return false;
   const request=pending.get(message.origin);
   if(request){
    pending.delete(message.origin);clearTimeout(request.timer);
    if(message.error)request.reject(new Error(message.error));
    else if(message.kind!==kind||!(message.bytes instanceof Uint8Array)||strictIdentity&&(message.section!==request.section||message[field]!==request.node))request.reject(new Error(invalidReply));
    else request.resolve(message.bytes);
   }
   return true;
  },
  reset(){for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error(documentChanged));}pending.clear();},
 };
}
