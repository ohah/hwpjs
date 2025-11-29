/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

// Buffer polyfill from index.html
interface BufferConstructor {
  from(data: ArrayLike<number> | ArrayBuffer): Uint8Array;
  isBuffer(obj: any): boolean;
  alloc(size: number): Uint8Array;
  concat(list: Uint8Array[]): Uint8Array;
  new (data: ArrayLike<number> | ArrayBuffer): Uint8Array;
  [key: string]: any;
}

declare var Buffer: BufferConstructor;
