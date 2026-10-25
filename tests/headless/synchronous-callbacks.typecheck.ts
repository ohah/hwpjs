/** Compile-only public API regression. DO NOT EXECUTE this fixture.
 * Check with: node tools/check-synchronous-callback-types.mjs
 * Expected errors enforce callback contracts; erased/ambiguous type limits stay explicit.
 */
import {EditorState,type HeadlessEditor,type EditorStatus,type StateData} from '../../packages/core/src/index.ts';
declare const e:HeadlessEditor;
// 1. Primitive/object inference.
const status:EditorStatus=e.read(s=>s.status);const object:{value:number}=e.read(()=>({value:1}));
// 2. Public snapshot read plus arbitrary generic constructor injection.
const hook=<T>(cb:(s:EditorState)=>T,s:EditorState):T=>cb(s);
declare const data:StateData;const snapshot=new EditorState(data,hook);const injectedStatus:EditorStatus=snapshot.read(s=>s.status);
// 3. Async and ordinary Promise producers.
// @ts-expect-error async read must fail
e.read(async()=>1);
// @ts-expect-error state read Promise must fail
snapshot.read(()=>Promise.resolve(1));
// 4. Structural thenable and PromiseLike; nonfunction then is data.
declare const thenable:{then:()=>unknown};declare const promiseLike:PromiseLike<number>;
// @ts-expect-error callable then is rejected
e.read(()=>thenable);
// @ts-expect-error PromiseLike is rejected
e.read(()=>promiseLike);
const thenData:{then:number}=e.read(()=>({then:1}));
// 5. Union must reject the entire callback, not just filter its Promise member.
declare const mixed:number|Promise<number>;
// @ts-expect-error mixed union cannot be a synchronous read result
e.read(()=>mixed);
declare const plainUnion:string|number;const preservedUnion:string|number=e.read(()=>plainUnion);
// 6. Overload positive and Promise overload negative.
declare function overloaded(s:EditorState):number;declare function overloaded(s:string):number;
const overloadValue:number=e.read(overloaded);
declare function asyncOverload(s:string):string;declare function asyncOverload(s:EditorState):Promise<number>;
// @ts-expect-error matching state overload is async
e.read(asyncOverload);
// 7. Undefined/null/never distinctions.
const absent:undefined=e.read(()=>undefined);const nil:null=e.read(()=>null);const neverValue:never=e.read(()=>{throw Error('never')});e.update(()=>{throw Error('never')});
// @ts-expect-error null is not a collector's undefined/void result
e.update(()=>null);
// 8. Update async, Promise, ordinary return values are all rejected.
// @ts-expect-error async collector
e.update(async()=>{});
// @ts-expect-error promise collector
e.update(()=>Promise.resolve());
// @ts-expect-error returned data
e.update(()=>123);
// 9. Inferred void, named void and undefined remain accepted.
const normalCollector=()=>{};e.update(normalCollector);e.update(()=>{});e.update(()=>undefined);
// 10. Generic callbacks instantiate against the real EditorState.
function identity<T>(value:T):T{return value;}const genericState:EditorState=e.read(identity);const genericSnapshot:EditorState=snapshot.read(identity);
// Deliberate static limits. Runtime remains authoritative for erased information.
declare const unknownResult:unknown;declare const anyResult:any;
const opaque:unknown=e.read(()=>unknownResult);e.read(()=>anyResult);e.update(()=>anyResult);
const annotatedVoid:()=>void=()=>123;e.update(annotatedVoid);
// Shadowed overload's broad synchronous signature can hide its Promise implementation.
declare function shadowed(s:EditorState):Promise<number>;declare function shadowed(s:unknown):number;e.read(shadowed);
void status;void object;void injectedStatus;void thenData;void preservedUnion;void overloadValue;void absent;void nil;void neverValue;void genericState;void genericSnapshot;void opaque;
