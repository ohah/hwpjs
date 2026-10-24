/** A releasable subscription fence; successful barriers must not accumulate Promise listeners. */
export class CancellationFence {
  #cancelled=false;
  #listeners=new Set<()=>void>();
  get cancelled(){return this.#cancelled;}
  get subscriberCount(){return this.#listeners.size;}
  subscribe(listener:()=>void):()=>void {
    if(this.#cancelled){listener();return ()=>{};}
    this.#listeners.add(listener);return ()=>{this.#listeners.delete(listener);};
  }
  cancel(){
    if(this.#cancelled)return;this.#cancelled=true;
    const listeners=[...this.#listeners];this.#listeners.clear();for(const listener of listeners)listener();
  }
}
export async function interruptible<T>(task:PromiseLike<T>,fences:readonly {fence:CancellationFence;error:string}[]):Promise<T>{
  const already=fences.find(({fence})=>fence.cancelled);
  if(already){void Promise.resolve(task).catch(()=>{});throw Error(already.error);}
  const unsubscribe:(()=>void)[]=[];
  const interrupted=new Promise<never>((_,reject)=>{
    for(const {fence,error} of fences)unsubscribe.push(fence.subscribe(()=>reject(Error(error))));
  });
  try{return await Promise.race([task,interrupted]);}finally{for(const off of unsubscribe)off();}
}
