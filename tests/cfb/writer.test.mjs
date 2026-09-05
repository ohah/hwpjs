import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createCfbReader, removeNode } from "../../js/cfb.mjs";
import { directoryOrder } from "./exception-fixtures.mjs";
import { miniContainer } from "./structured-fixtures.mjs";
import { encodeDocument } from "../../js/cfb-document.mjs";
const module = await WebAssembly.compile(
  readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)),
);
const ctx = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
runInNewContext(
  readFileSync(new URL("../../legacy/cfb.js", import.meta.url), "utf8"),
  ctx,
);
const legacy = ctx.module.exports;
const root = () => ({ name: "Root Entry", kind: 5 });

test("parse failures preserve or close both JS and WASM state at the open boundary", async () => {
  const instantiate = WebAssembly.instantiate;
  let failAllocation = false,
    failDecode = false;
  let api;
  try {
    WebAssembly.instantiate = async (...args) => {
      const instance = await instantiate(...args);
      const w = instance.exports;
      return {
        exports: {
          ...w,
          cfb_alloc: (size) => (failAllocation ? 0 : w.cfb_alloc(size)),
          cfb_value: (...values) => {
            if (failDecode) throw new Error("decode failed");
            return w.cfb_value(...values);
          },
        },
      };
    };
    api = await createCfbReader(module);
  } finally {
    WebAssembly.instantiate = instantiate;
  }
  try {
    const bytes = api.write({ nodes: [root(), { name: "Data", parent: 0 }] });
    const result = api.parse(bytes);
    const preserved = () => {
      assert.equal(api.document().nodes[1].name, "Data");
      assert.equal(api.findExact("/Data"), result.FileIndex[1]);
    };
    for (const key of ["raw", "strict"]) {
      let calls = 0;
      assert.throws(
        () =>
          api.parse(bytes, {
            get [key]() {
              calls++;
              throw Error("option failed");
            },
          }),
        { message: "option failed" },
      );
      assert.equal(calls, 1);
      preserved();
    }
    assert.throws(() => api.parse([256]), TypeError);
    preserved();
    failAllocation = true;
    assert.throws(() => api.parse(bytes), { message: "OutOfMemory" });
    failAllocation = false;
    preserved();
    failDecode = true;
    assert.throws(() => api.parse(bytes), { message: "decode failed" });
    failDecode = false;
    assert.throws(() => api.document(), { message: "NoDocument" });
    assert.equal(api.findExact("/Data"), null);
    api.parse(bytes);
    const damaged = bytes.slice();
    damaged[0] = 0;
    assert.throws(() => api.parse(damaged));
    assert.throws(() => api.document(), { message: "NoDocument" });
    assert.equal(api.findExact("/Data"), null);
    api.parse(bytes, { strict: true });
    assert.equal(api.findExact("/Data").name, "Data");
    assert.equal(api.find(result, "Data"), result.FileIndex[1]);
  } finally {
    api.close();
  }
});

test("WASM writer bridge rejects truncated/invalid models and preserves the active reader", async () => {
  const { exports: w } = await WebAssembly.instantiate(module, {});
  const wire = encodeDocument({
    nodes: [
      root(),
      { name: "Data", parent: 0, content: Uint8Array.of(1, 2, 3) },
    ],
  });
  const call = (bytes, fn) => {
    const ptr = w.cfb_alloc(bytes.length);
    assert.ok(ptr);
    try {
      new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
      return fn(ptr, bytes.length);
    } finally {
      w.cfb_free(ptr, bytes.length);
    }
  };
  try {
    assert.equal(call(wire, w.cfb_write), 1);
    const cfb = new Uint8Array(
      w.memory.buffer,
      w.cfb_output_ptr(),
      w.cfb_output_len(),
    ).slice();
    assert.equal(call(cfb, w.cfb_open_strict), 1);
    for (let len = 0; len < wire.length; len++) {
      assert.equal(call(wire.subarray(0, len), w.cfb_write), 0);
      assert.equal(w.cfb_output_len(), 0);
      assert.equal(w.cfb_count(), 4);
    }
    for (const [offset, value] of [
      [0, 9],
      [4, 0xffffffff],
      [8 + 4, 0xffffffff],
      [8 + 8, 0xffffffff],
      [8 + 12, 0xffffffff],
      [8 + 20, 1],
    ]) {
      const b = wire.slice();
      new DataView(b.buffer).setUint32(offset, value, true);
      assert.equal(call(b, w.cfb_write), 0);
      assert.equal(w.cfb_output_len(), 0);
    }
    const extra = new Uint8Array(wire.length + 1);
    extra.set(wire);
    assert.equal(call(extra, w.cfb_write), 0);
    assert.equal(call(wire, w.cfb_write), 1);
    assert.deepEqual(
      new Uint8Array(
        w.memory.buffer,
        w.cfb_output_ptr(),
        w.cfb_output_len(),
      ).slice(),
      cfb,
    );
  } finally {
    w.cfb_output_free();
    w.cfb_close();
  }
});

test("v3/v4 writer: independent parser, byte oracles, editable model and deterministic save", async () => {
  const api = await createCfbReader(module);
  try {
    for (const version of [3, 4])
      for (const size of [
        0, 1, 63, 64, 65, 511, 512, 513, 4095, 4096, 4097, 16385,
      ]) {
        const content = Uint8Array.from({ length: size }, (_, i) => i % 251);
        const doc = {
          version,
          nodes: [
            root(),
            { name: "Data", parent: 2, content },
            {
              name: "Folder",
              kind: 1,
              parent: 0,
              modified: 0xfedcba9876543210n,
            },
            { name: "Empty", parent: 0 },
          ],
        };
        const bytes = api.write(doc),
          parsed = api.parse(bytes, { strict: true });
        assert.deepEqual(
          Buffer.from(parsed.FileIndex[1].content ?? []),
          Buffer.from(content),
        );
        const ref = legacy.parse(Buffer.from(bytes));
        assert.deepEqual(
          Buffer.from(ref.FileIndex[1].content ?? []),
          Buffer.from(content),
        );
        assert.equal(parsed.FullPaths[1], "Root Entry/Folder/Data");
        const edit = api.document();
        assert.equal(edit.nodes[2].modified, 0xfedcba9876543210n);
        assert.deepEqual(api.write(edit), bytes);
        edit.nodes[1].name = "Renamed";
        edit.nodes[1].content = Uint8Array.of(9, 8, 7);
        edit.nodes.push({
          name: "Added",
          parent: 2,
          content: Uint8Array.of(6),
        });
        const removed = removeNode(edit, 3);
        api.parse(api.write(removed), { strict: true });
        assert.deepEqual(
          Buffer.from(api.findExact("/Folder/Renamed").content),
          Buffer.from([9, 8, 7]),
        );
        assert.equal(api.findExact("/Empty"), null);
        assert.equal(api.findExact("/Folder/Added").size, 1);
        api.parse(api.write(removeNode(removed, 2)), { strict: true });
        assert.equal(api.document().nodes.length, 1);
      }
  } finally {
    api.close();
  }
});

test("writer produces multiple DIFAT sectors and full independent payload", async () => {
  const api = await createCfbReader(module);
  try {
    const content = Uint8Array.from(
      { length: 16 * 1024 * 1024 },
      (_, i) => i % 251,
    );
    const bytes = api.write({
      nodes: [root(), { name: "Large", parent: 0, content }],
    });
    assert.ok(new DataView(bytes.buffer).getUint32(72, true) >= 2);
    const parsed = api.parse(bytes, { strict: true });
    assert.deepEqual(
      Buffer.from(parsed.FileIndex[1].content),
      Buffer.from(content),
    );
    assert.deepEqual(
      Buffer.from(legacy.parse(Buffer.from(bytes)).FileIndex[1].content),
      Buffer.from(content),
    );
  } finally {
    api.close();
  }
});

test("all 48 real HWP files: v3/v4 rebuild preserves every live field and stream byte", async () => {
  const api = await createCfbReader(module);
  const dir = new URL(
    "../../legacy/rust/crates/hwp-core/tests/fixtures/",
    import.meta.url,
  );
  const files = readdirSync(dir).filter((n) => n.endsWith(".hwp"));
  assert.equal(files.length, 48);
  let streams = 0;
  try {
    for (const name of files) {
      api.parse(readFileSync(new URL(name, dir)), { strict: true });
      const original = api.document();
      for (const version of [3, 4]) {
        const expected = { ...original, version },
          bytes = api.write(expected);
        api.parse(bytes, { strict: true });
        assert.deepEqual(api.document(), expected, name + ": semantic model");
        const reference = legacy.parse(Buffer.from(bytes));
        expected.nodes.forEach((node, i) => {
          assert.equal(reference.FileIndex[i].name, node.name);
          if (node.kind !== 2) return;
          assert.deepEqual(
            Buffer.from(reference.FileIndex[i].content ?? []),
            Buffer.from(node.content),
            name + ":" + node.name,
          );
          streams++;
        });
      }
    }
    assert.equal(streams, 904);
  } finally {
    api.close();
  }
});

test("strict allocation ownership, name lengths, unused metadata and global tree bounds", async () => {
  const api = await createCfbReader(module);
  try {
    const empty = Buffer.from(api.write({ nodes: [root()] }));
    const fat = empty.readUInt32LE(76),
      dir = empty.readUInt32LE(48),
      d = (dir + 1) * 512;
    const check = (input, error) => {
      assert.throws(() => api.parse(input, { strict: true }), {
        message: error,
      });
      api.parse(empty, { strict: true });
    };
    let b = Buffer.concat([empty, Buffer.alloc(512)]);
    b.writeUInt32LE(0xfffffffe, (fat + 1) * 512 + (b.length / 512 - 2) * 4);
    check(b, "UnclaimedSector");
    b = Buffer.from(empty);
    b.writeUInt32LE(0, 68);
    check(b, "InvalidDifat");
    b = Buffer.from(empty);
    b.writeUInt32LE(0xfffffffe, 80);
    check(b, "InvalidDifat");
    b = Buffer.from(empty);
    b[d + 128 + 96] = 1;
    check(b, "InvalidUnusedEntry");
    // v3 high DWORD is explicitly accepted even in strict mode.
    b = Buffer.from(empty);
    b.writeUInt32LE(0xdeadbeef, d + 124);
    api.parse(b, { strict: true });
    b = Buffer.from(api.write({ nodes: [root(), { name: "abc", parent: 0 }] }));
    b.writeUInt16LE(0, 512 + 128 + 2);
    check(b, "InvalidName");
    // B < D locally, but B is in C's right subtree and violates the ancestor bound.
    b = Buffer.from(
      api.write({
        nodes: [
          root(),
          ...["A", "B", "C", "D"].map((name) => ({ name, parent: 0 })),
        ],
      }),
    );
    const entryOffset = (i) => (1 + Math.floor(i / 4)) * 512 + (i % 4) * 128;
    b.writeUInt32LE(1, entryOffset(3) + 68); // C.left = A
    b.writeUInt32LE(0xffffffff, entryOffset(2) + 68); // B.left = none
    b.writeUInt32LE(2, entryOffset(4) + 68); // D.left = B
    check(b, "InvalidNameOrder");
    const mini = Buffer.from(
      api.write({
        nodes: [root(), { name: "x", parent: 0, content: Uint8Array.of(1) }],
      }),
    );
    const miniFat = mini.readUInt32LE(60);
    mini.writeUInt32LE(0xfffffffe, (miniFat + 1) * 512 + 4);
    check(mini, "UnclaimedMiniSector");
    assert.throws(
      () => api.write({ nodes: [root(), { name: "x", parent: 0xffffffff }] }),
      { message: "InvalidDirectoryReference" },
    );
    assert.throws(
      () => api.write({ nodes: [root(), { name: "x", parent: 1, kind: 1 }] }),
      { message: "InvalidDirectoryReference" },
    );
    assert.throws(
      () => api.write({ nodes: [root(), { name: "x".repeat(32), parent: 0 }] }),
      { message: "InvalidName" },
    );
    api.parse(
      api.write({ nodes: [root(), { name: "x".repeat(31), parent: 0 }] }),
      { strict: true },
    );
  } finally {
    api.close();
  }
});

test("deterministic generated hierarchies and strict mutation sweep recover without traps", async () => {
  const api = await createCfbReader(module);
  let seed = 0xdeadbeef;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  try {
    for (let trial = 0; trial < 64; trial++) {
      const nodes = [root()],
        parents = [0];
      for (let i = 1; i <= 24; i++) {
        const storage = random() % 4 === 0,
          parent = parents[random() % parents.length];
        const node = { name: "N" + i, parent, kind: storage ? 1 : 2 };
        if (storage) parents.push(i);
        else
          node.content = Uint8Array.from(
            { length: [0, 1, 64, 65, 4095, 4096, 4097][random() % 7] },
            () => random() % 256,
          );
        nodes.push(node);
      }
      const doc = { version: trial % 2 ? 3 : 4, nodes },
        bytes = api.write(doc);
      api.parse(bytes, { strict: true });
      assert.deepEqual(api.write(api.document()), bytes);
      for (let k = 0; k < 32; k++) {
        const changed = bytes.slice();
        changed[random() % changed.length] ^= 1 << (random() % 8);
        try {
          api.parse(changed, { strict: true });
        } catch (e) {
          assert.ok(!(e instanceof WebAssembly.RuntimeError), e.message);
        }
        api.parse(bytes, { strict: true });
      }
    }
  } finally {
    api.close();
  }
});

test("strict rejects spec violations, legacy-compatible parse remains separate", async () => {
  const api = await createCfbReader(module);
  const changes = [
    [(b) => (b[512] = 1), "InvalidHeader"],
    [(b) => (b[8] = 1), "InvalidHeader"],
    [(b) => b.writeUInt16LE(0, 28), "InvalidHeader"],
    [(b) => b.writeUInt32LE(1, 8192 + 3 * 128 + 116), "InvalidStorage"],
    [(b) => b.writeUInt32LE(1, 8192 + 3 * 128 + 120), "InvalidStorage"],
    [(b) => (b[8192 + 128 + 80] = 1), "InvalidStreamMetadata"],
    [(b) => (b[8192 + 128 + 100] = 1), "InvalidStreamMetadata"],
    [(b) => (b[8192 + 100] = 1), "InvalidRoot"],
    [(b) => b.write("X", 8192, "utf16le"), "InvalidRoot"],
    [(b) => b.writeUInt32LE(0, 8192 + 4 * 128 + 68), "InvalidUnusedEntry"],
    [(b) => b.write("A", 8192 + 256, "utf16le"), "InvalidNameOrder"],
    [(b) => b.write("0", 8192 + 256, "utf16le"), "InvalidNameOrder"],
    [
      (b) => {
        b[8192 + 128 + 67] = 0;
        b[8192 + 256 + 67] = 0;
      },
      "InvalidTreeColor",
    ],
    [(b) => b.writeUInt32LE(0xfffffffe, 4096 + 400), "InvalidFat"],
    [(b) => b.writeUInt32LE(0xffffffff, 68), "InvalidDifat"],
  ];
  try {
    api.parse(directoryOrder(), { strict: true });
    for (const [mutate, message] of changes) {
      const bytes = directoryOrder();
      mutate(bytes);
      assert.doesNotThrow(() => api.parse(bytes));
      assert.throws(() => api.parse(bytes, { strict: true }), { message });
      api.parse(directoryOrder(), { strict: true });
    }
    let b = miniContainer(3, 64, false).bytes;
    for (let o = 1280; o < 1536; o += 128)
      for (const f of [68, 72, 76]) b.writeUInt32LE(0xffffffff, o + f);
    const n = b.length / 512 - 1;
    b = Buffer.concat([b, Buffer.alloc(512, 255)]);
    b.writeUInt32LE(n, 520);
    b.writeUInt32LE(0xfffffffe, 512 + n * 4);
    assert.throws(() => api.parse(b, { strict: true }), {
      message: "InvalidMiniCount",
    });
    b = Buffer.from(miniContainer(3, 0, false).bytes.subarray(0, 1152));
    b.writeUInt32LE(0xfffffffe, 60);
    b.writeUInt32LE(0, 64);
    b.writeUInt32LE(0xffffffff, 520);
    b.writeUInt32LE(0xffffffff, 1100);
    assert.throws(() => api.parse(b, { strict: true }), {
      message: "InvalidFileSize",
    });
  } finally {
    api.close();
  }
});

test("exact lookup uses CFB simple uppercase and UTF16 ordering", async () => {
  const api = await createCfbReader(module);
  try {
    const doc = {
      nodes: [
        root(),
        ...["ß", "SS", "ᾀ", "𐐨", "𐐀"].map((name) => ({ name, parent: 0 })),
      ],
    };
    api.parse(api.write(doc), { strict: true });
    for (const name of ["ß", "SS", "𐐨", "𐐀"])
      assert.equal(api.findExact("/" + name).name, name);
    assert.equal(api.findExact("/ᾈ").name, "ᾀ");
    assert.throws(
      () =>
        api.write({
          nodes: [root(), { name: "a", parent: 0 }, { name: "A", parent: 0 }],
        }),
      { message: "DuplicateName" },
    );
    assert.throws(
      () => api.write({ nodes: [root(), { name: "a/b", parent: 0 }] }),
      { message: "InvalidName" },
    );
    assert.throws(
      () =>
        api.write({ nodes: [root(), { name: "x", parent: 0, created: 1n }] }),
      { message: "InvalidStreamMetadata" },
    );
    api.close();
    assert.throws(() => api.document(), { message: "NoDocument" });
  } finally {
    api.close();
  }
});
