import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {executeOracle} from "../../tools/oracle-process-async.mjs";

test("async oracle receives full large input and EOF without a temporary directory",async()=>{
 const input=Buffer.from("본문😀<&".repeat(300000));
 const output=await executeOracle("python3",["-c","import sys,hashlib; b=sys.stdin.buffer.read(); print(str(len(b))+':'+hashlib.sha256(b).hexdigest())"],{
  input,encoding:"utf8",timeout:10000,maxBuffer:1024,env:{...process.env,TMPDIR:"/nonexistent-hwpjs-oracle-tmp"},
 });
 assert.equal(output.trim(),`${input.length}:${createHash("sha256").update(input).digest("hex")}`);
});

test("async oracle closes stdin even when no input is supplied",async()=>{
 assert.equal(await executeOracle("python3",["-c","import sys; print(len(sys.stdin.buffer.read()))"],{encoding:"utf8",timeout:3000}),"0\n");
});

test("async oracle preserves nonzero exit and separate output diagnostics",async()=>{
 await assert.rejects(executeOracle("python3",["-c","import sys;sys.stdin.read();print('out');print('bad',file=sys.stderr);sys.exit(7)"],{
  input:"data",encoding:"utf8",timeout:3000,
 }),error=>error.status===7&&error.stdout==="out\n"&&error.stderr==="bad\n");
});

test("async oracle rejects invalid input ownership before spawning",()=>{
 assert.throws(()=>executeOracle("must-not-exist",[],{input:42}),{message:"InvalidOracleInput"});
 assert.throws(()=>executeOracle("must-not-exist",[],{input:"x",stdio:"inherit"}),{message:"Oracle input owns stdin/stdout/stderr"});
});

function assertGone(stdout){
 const pid=Number(String(stdout).trim());assert(Number.isSafeInteger(pid)&&pid>0,"ChildPidRequired");
 assert.throws(()=>process.kill(pid,0),error=>error.code==="ESRCH");
}

test("async oracle timeout waits for the owned child to terminate",async()=>{
 await assert.rejects(executeOracle("python3",["-c","import os,time; print(os.getpid(),flush=True);time.sleep(10)"],{
  input:"",encoding:"utf8",timeout:1000,
 }),error=>{assert.equal(error.signal,"SIGTERM");assertGone(error.stdout);return true;});
});

test("async oracle early closed stdin never leaves a child or swallows EPIPE",async()=>{
 await assert.rejects(executeOracle("python3",["-c","import os,time; print(os.getpid(),flush=True);os.close(0);time.sleep(10)"],{
  input:Buffer.alloc(8*1024*1024,65),encoding:"utf8",timeout:3000,
 }),error=>{assert(error.signal==="SIGTERM"||error.code==="EPIPE");assertGone(error.stdout);return true;});
});

test("async oracle preserves spawn failure instead of a pipe error",async()=>{
 await assert.rejects(executeOracle("/nonexistent-hwpjs-oracle-command",[],{input:"x",timeout:3000}),error=>error.code==="ENOENT"&&error.status===null);
});

test("async oracle output budget terminates the child and bounds diagnostics",async()=>{
 await assert.rejects(executeOracle("python3",["-c","import os,sys,time;print(os.getpid(),flush=True);sys.stdout.write('x'*1000000);sys.stdout.flush();time.sleep(10)"],{
  input:"",encoding:"utf8",timeout:3000,maxBuffer:16384,
 }),error=>{
  assert.equal(error.code,"ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
  assert(error.stdout.length<=16384);assertGone(error.stdout.split("\n")[0]);return true;
 });
});
