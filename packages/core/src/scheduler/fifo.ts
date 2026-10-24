/** A rejection never poisons later work. All backend work must enter this queue. */
export class FifoScheduler {
  #tail:Promise<unknown>=Promise.resolve();
  enqueue<T>(task:()=>T|Promise<T>):Promise<T> {
    const result=this.#tail.then(task);this.#tail=result.then(()=>{},()=>{});return result;
  }
  drain():Promise<void> {return this.#tail.then(()=>{});}
}
