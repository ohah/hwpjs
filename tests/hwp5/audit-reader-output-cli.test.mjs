import test from "node:test";
import assert from "node:assert/strict";
import {openSync,closeSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
assert(process.env.HWPJS_TEST_WASM,"Explicit reader-output candidate required");
test("actual reader audit CLI fails closed on readonly stdout and simulated ENOSPC",()=>{
 const args=["tools/reference-reader-parity-audit.mjs",`--before-wasm=${process.env.HWPJS_TEST_WASM}`,`--after-wasm=${process.env.HWPJS_TEST_WASM}`,"--root=legacy/rust/crates/hwp-core/tests/fixtures"];
 const path=new URL(import.meta.url),before=readFileSync(path),fd=openSync(path,"r");
 try{
  const closed=spawnSync(process.execPath,args,{stdio:["ignore",fd,"pipe"],encoding:"utf8"});
  assert.equal(closed.status,1);assert.equal(closed.signal,null);assert.match(closed.stderr,/EBADF/);
 }finally{closeSync(fd);}
 const preload='import fs from "node:fs";import{syncBuiltinESMExports}from"node:module";const original=fs.writeSync;fs.writeSync=(fd,...args)=>{if(fd===1)throw Object.assign(new Error("simulated disk full"),{code:"ENOSPC"});return original(fd,...args)};syncBuiltinESMExports();';
 const disk=spawnSync(process.execPath,["--import",`data:text/javascript;base64,${Buffer.from(preload).toString("base64")}`,...args],{encoding:"utf8"});
 assert.equal(disk.status,1);assert.equal(disk.signal,null);assert.equal(disk.stdout,"");assert.match(disk.stderr,/ENOSPC/);
 assert.deepEqual(readFileSync(path),before);
});
