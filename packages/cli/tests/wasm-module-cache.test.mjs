import assert from 'node:assert/strict';
import test from 'node:test';
import { createWasmModuleCache, WASM_MODULE_CACHE_MAX_BYTES } from '../src/wasm-module.ts';

// Synthetic real binaries only; ownership transfers to compileOwned and none of
// these arrays is mutated afterwards. Public engine snapshotting is tested elsewhere.
function tinyWasm(value) {
  assert.ok(Number.isInteger(value) && value >= 0 && value < 64);
  return Uint8Array.of(
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    6,
    6,
    1,
    0x7f,
    0,
    0x41,
    value,
    0x0b,
    7,
    5,
    1,
    1,
    0x76,
    3,
    0,
  );
}

function leb(value) {
  const bytes = [];
  do {
    const byte = value & 0x7f;
    value = Math.floor(value / 128);
    bytes.push(byte | (value ? 0x80 : 0));
  } while (value);
  return bytes;
}

function paddedWasm(size, value) {
  const base = tinyWasm(value);
  // Custom section: empty UTF-8 name followed by inert zero padding.
  for (let width = 1; width <= 5; width++) {
    const payload = size - base.length - 1 - width;
    const encoded = leb(payload);
    if (payload >= 1 && encoded.length === width) {
      const bytes = new Uint8Array(size);
      bytes.set(base);
      bytes.set([0, ...encoded, 0], base.length);
      return bytes;
    }
  }
  throw new Error('Unrepresentable custom section size');
}

function valueOf(module) {
  assert.ok(module instanceof WebAssembly.Module);
  return new WebAssembly.Instance(module).exports.v.value;
}

function deferred() {
  return Promise.withResolvers();
}

async function observed(run, hooks = {}) {
  const subtle = globalThis.crypto.subtle;
  const compile = WebAssembly.compile;
  const digest = subtle.digest;
  const compileDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, 'compile');
  const digestDescriptor = Object.getOwnPropertyDescriptor(subtle, 'digest');
  const counts = { compile: 0, nativeCompile: 0, digest: 0, nativeDigest: 0 };
  // Hooks may delay or reject a result, but cannot fabricate a successful module
  // or fingerprint. Native call counts are separate from wrapper invocations.
  try {
    WebAssembly.compile = function (...args) {
      const call = ++counts.compile;
      const native = () => {
        counts.nativeCompile++;
        return Reflect.apply(compile, WebAssembly, args);
      };
      return hooks.compile ? hooks.compile(call, native) : native();
    };
    subtle.digest = function (...args) {
      assert.equal(args[0], 'SHA-256');
      const call = ++counts.digest;
      const native = () => {
        counts.nativeDigest++;
        return Reflect.apply(digest, subtle, args);
      };
      return hooks.digest ? hooks.digest(call, native) : native();
    };
    await run(counts);
  } finally {
    Object.defineProperty(WebAssembly, 'compile', compileDescriptor);
    if (digestDescriptor) Object.defineProperty(subtle, 'digest', digestDescriptor);
    else delete subtle.digest;
    assert.equal(WebAssembly.compile, compile);
    assert.equal(subtle.digest, digest);
  }
}

// All global wrappers are scoped to awaited, serial subtests and restored even
// when an assertion fails. Run this file with --test-concurrency=1.
test(
  'Wasm module cache: real modules and explicitly injected failures',
  { concurrency: false },
  async (t) => {
    await t.test(
      'real: copies reuse identity; first compile is immediate and hashing is deferred',
      async () => {
        await observed(async (counts) => {
          const cache = createWasmModuleCache();
          const first = cache.compileOwned(tinyWasm(1));
          assert.equal(counts.compile, 1);
          assert.equal(counts.digest, 0);
          const a = await first;
          assert.equal(valueOf(a), 1);
          const b = await cache.compileOwned(tinyWasm(1));
          assert.strictEqual(b, a);
          assert.equal(valueOf(b), 1);
          assert.equal(counts.digest, 2);
          assert.strictEqual(await cache.compileOwned(tinyWasm(1)), a);
          assert.deepEqual(counts, { compile: 1, nativeCompile: 1, digest: 3, nativeDigest: 3 });
          const left = new WebAssembly.Instance(a);
          const right = new WebAssembly.Instance(b);
          assert.notStrictEqual(left, right);
          assert.notStrictEqual(left.exports.v, right.exports.v);
          assert.equal(left.exports.v.value, 1);
          assert.equal(right.exports.v.value, 1);
        });
      },
    );

    await t.test(
      'real: different same-length exports separate modules and evict the single entry',
      async () => {
        await observed(async (counts) => {
          const cache = createWasmModuleCache();
          assert.equal(tinyWasm(1).length, tinyWasm(2).length);
          const a = await cache.compileOwned(tinyWasm(1));
          const b = await cache.compileOwned(tinyWasm(2));
          assert.notStrictEqual(a, b);
          assert.equal(valueOf(a), 1);
          assert.equal(valueOf(b), 2);
          assert.strictEqual(await cache.compileOwned(tinyWasm(2)), b);
          const again = await cache.compileOwned(tinyWasm(1));
          assert.notStrictEqual(again, a);
          assert.notStrictEqual(again, b);
          assert.equal(valueOf(again), 1);
          assert.equal(counts.nativeCompile, 3);
          assert.equal(counts.compile, 3);
        });
      },
    );

    await t.test(
      'real: unequal lengths skip hashing and evict even for equivalent exports',
      async () => {
        await observed(async (counts) => {
          const cache = createWasmModuleCache();
          const small = await cache.compileOwned(tinyWasm(2));
          const padded = await cache.compileOwned(paddedWasm(64, 2));
          const again = await cache.compileOwned(tinyWasm(2));
          assert.notStrictEqual(small, padded);
          assert.notStrictEqual(small, again);
          for (const module of [small, padded, again]) assert.equal(valueOf(module), 2);
          assert.deepEqual(counts, { compile: 3, nativeCompile: 3, digest: 0, nativeDigest: 0 });
        });
      },
    );

    await t.test(
      'real: exactly 16 MiB is cached; one byte over clears and compiles uncached',
      async () => {
        await observed(async (counts) => {
          assert.equal(WASM_MODULE_CACHE_MAX_BYTES, 16 * 1024 * 1024);
          const cache = createWasmModuleCache();
          const atCap = await cache.compileOwned(paddedWasm(WASM_MODULE_CACHE_MAX_BYTES, 1));
          assert.strictEqual(
            await cache.compileOwned(paddedWasm(WASM_MODULE_CACHE_MAX_BYTES, 1)),
            atCap,
          );
          assert.equal(valueOf(atCap), 1);
          const over = await cache.compileOwned(paddedWasm(WASM_MODULE_CACHE_MAX_BYTES + 1, 2));
          const overAgain = await cache.compileOwned(
            paddedWasm(WASM_MODULE_CACHE_MAX_BYTES + 1, 2),
          );
          assert.notStrictEqual(over, overAgain);
          assert.equal(valueOf(over), 2);
          assert.equal(valueOf(overAgain), 2);
          const restored = await cache.compileOwned(paddedWasm(WASM_MODULE_CACHE_MAX_BYTES, 1));
          assert.notStrictEqual(restored, atCap);
          assert.equal(valueOf(restored), 1);
          assert.deepEqual(counts, { compile: 4, nativeCompile: 4, digest: 2, nativeDigest: 2 });
        });
      },
    );

    await t.test(
      'controlled delays: both native digests start in parallel; matching pending compile coalesces',
      async () => {
        const hashGate = deferred();
        const compileGate = deferred();
        const allHashesStarted = deferred();
        const allHashesDelivered = deferred();
        let delivered = 0;
        await observed(
          async (counts) => {
            const cache = createWasmModuleCache();
            const first = cache.compileOwned(tinyWasm(1));
            const second = cache.compileOwned(tinyWasm(1));
            const third = cache.compileOwned(tinyWasm(1));
            try {
              assert.equal(counts.compile, 1);
              await allHashesStarted.promise;
              assert.equal(counts.digest, 3);
              hashGate.resolve();
              await allHashesDelivered.promise;
              // Resolve hashes while compilation is still held. An extra compile is
              // observable before releasing the first module promise.
              await new Promise((resolve) => setImmediate(resolve));
              assert.equal(counts.compile, 1);
            } finally {
              hashGate.resolve();
              compileGate.resolve();
            }
            const modules = await Promise.all([first, second, third]);
            for (const module of modules) {
              assert.strictEqual(module, modules[0]);
              assert.equal(valueOf(module), 1);
            }
            assert.deepEqual(counts, { compile: 1, nativeCompile: 1, digest: 3, nativeDigest: 3 });
          },
          {
            compile: async (_call, native) => {
              const module = await native();
              await compileGate.promise;
              return module;
            },
            digest: async (call, native) => {
              const result = native();
              if (call === 3) allHashesStarted.resolve();
              await hashGate.promise;
              const digest = await result;
              if (++delivered === 3) allHashesDelivered.resolve();
              return digest;
            },
          },
        );
      },
    );

    await t.test(
      'injected late failure: old compile cannot evict a newer successful entry',
      async () => {
        const failure = new Error('InjectedOldCompileFailure');
        const gate = deferred();
        await observed(
          async (counts) => {
            const cache = createWasmModuleCache();
            const old = cache.compileOwned(tinyWasm(1));
            const rejected = assert.rejects(old, (error) => error === failure);
            let newer;
            try {
              newer = await cache.compileOwned(tinyWasm(2));
              assert.equal(valueOf(newer), 2);
            } finally {
              gate.resolve();
            }
            await rejected;
            assert.strictEqual(await cache.compileOwned(tinyWasm(2)), newer);
            assert.equal(counts.compile, 2);
            assert.equal(counts.nativeCompile, 2);
          },
          {
            compile: async (call, native) => {
              const module = await native();
              if (call === 1) {
                await gate.promise;
                throw failure;
              }
              return module;
            },
          },
        );
      },
    );

    await t.test(
      'real: invalid Wasm rejects on every retry and a later valid module recovers',
      async () => {
        await observed(async (counts) => {
          const cache = createWasmModuleCache();
          for (let attempt = 0; attempt < 2; attempt++) {
            await assert.rejects(cache.compileOwned(Uint8Array.of(0)), WebAssembly.CompileError);
          }
          const valid = await cache.compileOwned(tinyWasm(2));
          assert.equal(valueOf(valid), 2);
          assert.strictEqual(await cache.compileOwned(tinyWasm(2)), valid);
          assert.deepEqual(counts, { compile: 3, nativeCompile: 3, digest: 2, nativeDigest: 2 });
        });
      },
    );

    await t.test(
      'injected compile rejection: identical valid bytes retry instead of retaining failure',
      async () => {
        const failure = new Error('InjectedCompileFailure');
        await observed(
          async (counts) => {
            const cache = createWasmModuleCache();
            await assert.rejects(cache.compileOwned(tinyWasm(1)), (error) => error === failure);
            assert.equal(counts.digest, 0);
            const retried = await cache.compileOwned(tinyWasm(1));
            assert.equal(valueOf(retried), 1);
            assert.strictEqual(await cache.compileOwned(tinyWasm(1)), retried);
            assert.deepEqual(counts, { compile: 2, nativeCompile: 1, digest: 2, nativeDigest: 2 });
          },
          { compile: (call, native) => (call === 1 ? Promise.reject(failure) : native()) },
        );
      },
    );

    for (const failingDigest of [1, 2]) {
      await t.test(
        `injected digest ${failingDigest} rejection: native compile fallback and healthy hash retry`,
        async () => {
          await observed(
            async (counts) => {
              const cache = createWasmModuleCache();
              const first = await cache.compileOwned(tinyWasm(1));
              const fallback = await cache.compileOwned(tinyWasm(1));
              assert.notStrictEqual(fallback, first);
              assert.equal(valueOf(first), 1);
              assert.equal(valueOf(fallback), 1);
              assert.strictEqual(await cache.compileOwned(tinyWasm(1)), fallback);
              assert.deepEqual(counts, {
                compile: 2,
                nativeCompile: 2,
                digest: 4,
                nativeDigest: 3,
              });
            },
            {
              digest: (call, native) =>
                call === failingDigest
                  ? Promise.reject(new Error('InjectedDigestFailure'))
                  : native(),
            },
          );
        },
      );
    }
  },
);
