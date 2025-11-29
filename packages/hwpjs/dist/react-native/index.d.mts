import { NativeModule } from "craby-modules";

//#region src/NativeReactNative.d.ts
interface Spec extends NativeModule {
  hwp_parser(data: number[]): string;
  add(a: number, b: number): number;
  subtract(a: number, b: number): number;
  multiply(a: number, b: number): number;
  divide(a: number, b: number): number;
}
declare const _default: Spec;
//#endregion
export { _default as ReactNative };
//# sourceMappingURL=index.d.mts.map