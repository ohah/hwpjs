// Read-only E2E witness. Delegate every original Worker call unchanged.
(()=>{
 const audit=window.__demoEditAudit={requests:[],replies:[],content:null,saves:[],keys:[]};
 const workers=new WeakSet(),post=Worker.prototype.postMessage;
 const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
 Worker.prototype.postMessage=function(envelope,...rest){
  if(!workers.has(this)){workers.add(this);this.addEventListener('message',event=>{
   const reply=event.data?.reply;if(!reply)return;
   if(reply.content)audit.content=reply.content;
   audit.replies.push({kind:reply.kind,error:reply.error??null,revision:reply.historyRevision});
   if(reply.kind==='save'&&!reply.error&&reply.bytes)audit.saves.push({base64:encode(reply.bytes),format:reply.format});
  });}
  if(envelope?.message)audit.requests.push({kind:envelope.message.kind});
  return post.call(this,envelope,...rest);
 };
 document.addEventListener('keydown',event=>audit.keys.push({trusted:event.isTrusted,code:event.code,key:event.key,meta:event.metaKey,control:event.ctrlKey,shift:event.shiftKey,alt:event.altKey,repeat:event.repeat}),true);
})();
