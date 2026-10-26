import test from "node:test";
import assert from "node:assert/strict";
import { createWorkerEditorRuntime, createWorkerRuntimeFactory } from "../../src/worker-runtime.ts";

const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
class FakeWorker {
  listeners = new Map<string, Set<(event: any) => void>>();
  sent: any[] = [];
  terminations = 0;
  addEventListener(type: string, listener: (event: any) => void) {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  postMessage(value: any) {
    this.sent.push(value);
    if (value.message.kind === "initialize-runtime")
      queueMicrotask(() => this.reply(value.id, { kind: value.message.kind }));
  }
  reply(id: number, reply: unknown) {
    this.emit("message", { data: { id, reply } });
  }
  emit(type: string, event: any) {
    // oxlint-disable-next-line unicorn/no-useless-spread -- 순회 중 리스너가 등록·해제되어도 접수 시점의 구독 목록을 순회하도록 snapshot을 유지한다.
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
  terminate() {
    this.terminations++;
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

class EchoWorker extends FakeWorker {
  override postMessage(value: any) {
    super.postMessage(value);
    if (value.message.kind !== "initialize-runtime")
      queueMicrotask(() => this.reply(value.id, { kind: value.message.kind }));
  }
}

test("factory reuses one compiled module across independent document workers", async () => {
  let loads = 0;
  const workers: EchoWorker[] = [];
  const factory = createWorkerRuntimeFactory({
    loadWasmModule: async () => {
      loads++;
      return module;
    },
    workerFactory: () => {
      const worker = new EchoWorker();
      workers.push(worker);
      return worker;
    },
  });
  assert.equal(await factory.preload(), module);
  assert.equal(workers.length, 0, "preloading must not create a document worker or instance");
  const first = await factory(),
    second = await factory();
  try {
    await Promise.all([first.request({ kind: "one" }), second.request({ kind: "two" })]);
    assert.equal(loads, 1, "replacement documents must not download the same artifact again");
    assert.equal(workers.length, 2);
    assert.notEqual(workers[0], workers[1]);
    for (const worker of workers) assert.equal(worker.sent[0].message.wasmModule, module);
    await first.dispose();
    assert.equal(workers[1].terminations, 0);
    assert.equal((await second.request({ kind: "still-alive" })).kind, "still-alive");
  } finally {
    await first.dispose();
    await second.dispose();
  }
});

test("factory evicts failed module loading so a later document can retry", async () => {
  let loads = 0;
  const factory = createWorkerRuntimeFactory({
    workerFactory: () => new EchoWorker(),
    loadWasmModule: async () => {
      if (++loads === 1) throw Error("TemporaryArtifactFailure");
      return module;
    },
  });
  const failed = await factory();
  await assert.rejects(failed.request({ kind: "one" }), /TemporaryArtifactFailure/);
  await failed.dispose();
  const retried = await factory();
  try {
    assert.equal((await retried.request({ kind: "two" })).kind, "two");
    assert.equal(loads, 2);
  } finally {
    await retried.dispose();
  }
});

test("a reused worker is refused without terminating its existing owner", async () => {
  const worker = new EchoWorker();
  const factory = createWorkerRuntimeFactory({ workerFactory: () => worker, wasmModule: module });
  const first = await factory();
  try {
    await assert.rejects(async () => factory(), /WorkerAlreadyOwned/);
    assert.equal(worker.terminations, 0);
    assert.equal((await first.request({ kind: "still-owned" })).kind, "still-owned");
  } finally {
    await first.dispose();
  }
  assert.equal(worker.terminations, 1);
});

test("disposing one candidate does not cancel the factory module used by another", async () => {
  let loads = 0,
    release!: (value: WebAssembly.Module) => void;
  const shared = new Promise<WebAssembly.Module>((resolve) => {
    release = resolve;
  });
  const factory = createWorkerRuntimeFactory({
    workerFactory: () => new EchoWorker(),
    loadWasmModule: () => {
      loads++;
      return shared;
    },
  });
  const first = await factory(),
    second = await factory();
  const abandoned = assert.rejects(first.request({ kind: "abandoned" }), /RuntimeDisposed/);
  const accepted = second.request({ kind: "accepted" });
  await first.dispose();
  release(module);
  try {
    await abandoned;
    assert.equal((await accepted).kind, "accepted");
    assert.equal(loads, 1);
  } finally {
    await second.dispose();
  }
});

test("worker runtime copies queued input and binds out-of-order replies to their own context", async () => {
  const worker = new FakeWorker();
  let release!: (value: WebAssembly.Module) => void;
  const runtime = createWorkerEditorRuntime({
    workerFactory: () => worker,
    loadWasmModule: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const input = new Uint8Array([1, 2, 3]);
  const context = {
    editorId: "A",
    documentId: "doc",
    generation: 1,
    requestId: 7,
    operationRevision: 0,
  };
  const first = runtime.request({ kind: "one", bytes: input }, context);
  const second = runtime.request({ kind: "two" });
  input.fill(9);
  context.requestId = 99;
  await tick();
  release(module);
  await tick();
  const one = worker.sent.find((item) => item.message.kind === "one"),
    two = worker.sent.find((item) => item.message.kind === "two");
  assert.deepEqual([...one.message.bytes], [1, 2, 3]);
  worker.reply(two.id, { kind: "two", value: 2 });
  worker.reply(one.id, { kind: "one", value: 1 });
  assert.equal((await first).meta?.context?.requestId, 7);
  assert.equal((await second).value, 2);
  await runtime.dispose();
  await runtime.dispose();
  assert.equal(worker.terminations, 1);
  assert([...worker.listeners.values()].every((group) => group.size === 0));
});

test("worker crash rejects pending and future requests and cleans its resources once", async () => {
  const worker = new FakeWorker(),
    runtime = createWorkerEditorRuntime({ workerFactory: () => worker, wasmModule: module });
  const pending = runtime.request({ kind: "pending" });
  const rejected = assert.rejects(pending, /WorkerRuntimeFailed/);
  await tick();
  worker.emit("error", {});
  await rejected;
  await assert.rejects(runtime.request({ kind: "late" }), /WorkerRuntimeFailed/);
  await runtime.dispose();
  assert.equal(worker.terminations, 1);
});

test("dispose during module loading fences initialization and failed module loading terminates the worker", async () => {
  const worker = new FakeWorker();
  let release!: (module: WebAssembly.Module) => void;
  const runtime = createWorkerEditorRuntime({
    workerFactory: () => worker,
    loadWasmModule: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = runtime.request({ kind: "pending" });
  const rejected = assert.rejects(pending, /RuntimeDisposed/);
  await tick();
  await runtime.dispose();
  release(module);
  await rejected;
  assert.equal(worker.sent.length, 0);
  assert.equal(worker.terminations, 1);
  const failedWorker = new FakeWorker();
  const failed = createWorkerEditorRuntime({
    workerFactory: () => failedWorker,
    loadWasmModule: async () => {
      throw Error("WasmMissing");
    },
  });
  await assert.rejects(failed.request({ kind: "load" }), /WasmMissing/);
  await failed.dispose();
  assert.equal(failedWorker.terminations, 1);
});

test("shared payload buffers are rejected instead of aliased across the module-loading await", async () => {
  const worker = new FakeWorker(),
    runtime = createWorkerEditorRuntime({ workerFactory: () => worker, wasmModule: module });
  try {
    await assert.rejects(
      runtime.request({ kind: "load", bytes: new Uint8Array(new SharedArrayBuffer(4)) }),
      /SharedBufferUnsupported/,
    );
  } finally {
    await runtime.dispose();
  }
});

test("separate document workers receive distinct host reference scopes", async () => {
  const workers: EchoWorker[] = [];
  const factory = createWorkerRuntimeFactory({
    wasmModule: module,
    workerFactory: () => {
      const worker = new EchoWorker();
      workers.push(worker);
      return worker;
    },
  });
  const a = await factory(),
    b = await factory();
  try {
    await Promise.all([a.request({ kind: "ready" }), b.request({ kind: "ready" })]);
    const scopes = workers.map((w) => w.sent[0].message.referenceScope);
    assert(scopes.every((s) => typeof s === "string" && s.length > 0));
    assert.notEqual(scopes[0], scopes[1]);
  } finally {
    await a.dispose();
    await b.dispose();
  }
});
