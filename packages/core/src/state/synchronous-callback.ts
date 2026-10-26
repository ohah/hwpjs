/** Runtime callback guards remain authoritative for erased/unknown/void-annotated values. */
export type SynchronousResult<T> = T extends { then: (...args: any[]) => unknown } ? never : T;
export type SynchronousCallback<A extends unknown[], T> = (...args: A) => T & SynchronousResult<T>;
export type UpdateCallback<A extends unknown[], T> = (
  ...args: A
) => T & (T extends void ? unknown : never) & SynchronousResult<T>;
