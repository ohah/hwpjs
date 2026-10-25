import type { SynchronousCallback } from './synchronous-callback.ts';
import { ownObservation, discardPromise, isPromiseLike } from './owned.ts';
export type EditorStatus='empty'|'loading'|'ready'|'refresh-required'|'disposed';
export interface StateToken { readonly editorId:string; readonly documentId:string|null; readonly generation:number; readonly operationRevision:number; readonly viewRevision:number; }
export interface StateData extends StateToken { readonly status:EditorStatus; readonly stateVersion:number; readonly content?:unknown; readonly capabilities?:unknown; readonly nativeHistoryRevision?:number; readonly nativeHistoryRevisions?:readonly number[]; readonly savedOperationRevision?:number; readonly selection?:unknown; }
/** An owned observation, deliberately not a serializable document/checkpoint. */
export class EditorState {
  readonly editorId:string; readonly documentId:string|null; readonly generation:number;
  readonly operationRevision:number; readonly viewRevision:number; readonly stateVersion:number;
  readonly status:EditorStatus; readonly nativeHistoryRevision?:number; readonly savedOperationRevision?:number;
  #historyRevisions:()=>readonly number[]|undefined;
  #content:()=>unknown; #capabilities:()=>unknown; #selection:()=>unknown;
  #read:<T>(callback:(state:EditorState)=>T,state:EditorState)=>T;
  constructor(data:StateData, read:<T>(callback:(state:EditorState)=>T,state:EditorState)=>T = localRead) {
    this.editorId=data.editorId;this.documentId=data.documentId;this.generation=data.generation;
    this.operationRevision=data.operationRevision;this.viewRevision=data.viewRevision;this.stateVersion=data.stateVersion;this.status=data.status;
    this.nativeHistoryRevision=data.nativeHistoryRevision;this.#historyRevisions=ownObservation(data.nativeHistoryRevisions);this.savedOperationRevision=data.savedOperationRevision;
    this.#content=ownObservation(data.content);this.#capabilities=ownObservation(data.capabilities);this.#selection=ownObservation(data.selection);this.#read=read;
    Object.freeze(this);
  }
  get nativeHistoryRevisions():readonly number[]|undefined {return this.#historyRevisions();}
  get token():StateToken {return Object.freeze({editorId:this.editorId,documentId:this.documentId,generation:this.generation,operationRevision:this.operationRevision,viewRevision:this.viewRevision});}
  get content():unknown {return this.#content();}
  get capabilities():unknown {return this.#capabilities();}
  get selection():unknown {return this.#selection();}
  read<T>(callback:SynchronousCallback<[EditorState],T>):T {return this.#read(callback,this);}
}
function localRead<T>(callback:(state:EditorState)=>T,state:EditorState):T {
 const result=callback(state);if(isPromiseLike(result)){discardPromise(result);throw Error('AsyncRead');}return result;
}
