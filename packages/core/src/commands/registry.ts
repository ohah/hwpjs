import type { EditorCommand } from './commands.ts';
import { discardPromise, isPromiseLike } from '../state/owned.ts';
type Handler={priority:number;order:number;callback:(payload:unknown)=>boolean};
export class CommandRegistry {
 #handlers=new Map<symbol,Handler[]>();#order=0;
 register<T>(command:EditorCommand<T>,callback:(payload:T)=>boolean,priority:number):()=>void {
  if(!Number.isFinite(priority))throw Error('InvalidPriority');
  const row:Handler={priority,order:this.#order++,callback:callback as (payload:unknown)=>boolean};
  const rows=this.#handlers.get(command.id)??[];rows.push(row);this.#handlers.set(command.id,rows);
  let active=true;return ()=>{if(!active)return;active=false;const next=(this.#handlers.get(command.id)??[]).filter(x=>x!==row);if(next.length)this.#handlers.set(command.id,next);else this.#handlers.delete(command.id);};
 }
 capture<T>(command:EditorCommand<T>):readonly Handler[] {return [...(this.#handlers.get(command.id)??[])].sort((a,b)=>b.priority-a.priority||a.order-b.order);}
 run(handlers:readonly Handler[],payload:unknown,copy:(v:unknown)=>unknown):boolean {
  for(const handler of handlers){if(Object.prototype.toString.call(handler.callback)==='[object AsyncFunction]')throw Error('AsyncCommandHandler');const value=handler.callback(copy(payload));if(isPromiseLike(value)){discardPromise(value);throw Error('AsyncCommandHandler');}if(typeof value!=='boolean')throw Error('InvalidCommandHandlerResult');if(value)return true;}return false;
 }
 clear(){this.#handlers.clear();}
}
