import assert from "node:assert/strict";
import { summaryFixture, summaryActual } from "./summary.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const cp = (n) => Buffer.concat([w(2), w(n)]);
const text = (b) =>
  Buffer.concat([
    w(30),
    w(b.length),
    b,
    Buffer.alloc((4 - (b.length % 4)) % 4),
  ]);
function dict(entries, unicode) {
  const parts = [w(entries.length)];
  for (const [id, name] of entries)
    parts.push(
      w(id),
      w(name.length / (unicode ? 2 : 1)),
      name,
      ...(unicode ? [Buffer.alloc((4 - (name.length % 4)) % 4)] : []),
    );
  const b = Buffer.concat(parts);
  return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
}
export function codepageEdges(call) {
  const good = summaryFixture([
    [2, text(Buffer.from("A\0"))],
    [1, cp(1252)],
  ]);
  let rejected = 0;
  const reject = (b, error) => {
    assert.throws(() => call(27, b), error);
    summaryActual(call, good);
    rejected++;
  };
  // Code page comes after dependent text/dictionary, not necessarily first.
  for (const page of [949, 1252, 1200, 65001]) {
    const bytes = Buffer.from("A\0B\0", page === 1200 ? "utf16le" : "utf8");
    for (const rows of [
      [
        [2, text(bytes)],
        [1, cp(page)],
      ],
      [
        [1, cp(page)],
        [2, text(bytes)],
      ],
    ])
      summaryActual(call, summaryFixture(rows));
    summaryActual(
      call,
      summaryFixture([
        [2, text(Buffer.alloc(0))],
        [1, cp(page)],
      ]),
    );
    const names =
      page === 1200
        ? [Buffer.from("A\0", "utf16le"), Buffer.from("BB\0", "utf16le")]
        : [Buffer.from("AA\0"), Buffer.from("B\0")];
    const dictionary = dict(
      [
        [2, names[0]],
        [3, names[1]],
      ],
      page === 1200,
    );
    summaryActual(
      call,
      summaryFixture([
        [0, dictionary],
        [1, cp(page)],
      ]),
    );
    reject(
      summaryFixture([
        [
          0,
          dict(
            [
              [2, names[0]],
              [2, names[1]],
            ],
            page === 1200,
          ),
        ],
        [1, cp(page)],
      ]),
      /DuplicateDictionaryId/,
    );
    for (const id of [0, 1, 0x80000000, 0xffffffff])
      reject(
        summaryFixture([
          [0, dict([[id, names[0]]], page === 1200)],
          [1, cp(page)],
        ]),
        /InvalidDictionaryId/,
      );
    reject(
      summaryFixture([
        [1, cp(page)],
        [0, w(0xffffffff)],
      ]),
      /UnexpectedEnd/,
    );
    for (let n = 0; n < dictionary.length; n++)
      reject(
        summaryFixture([
          [1, cp(page)],
          [0, dictionary.subarray(0, n)],
        ]),
        n === 0
          ? /InvalidSummaryOffset/
          : /UnexpectedEnd|InvalidSummaryTerminator|InvalidSummaryPadding/,
      );
  }
  reject(
    summaryFixture([[1, Buffer.concat([w(3), w(1200)])]]),
    /InvalidSummaryPropertyType/,
  );
  reject(
    summaryFixture([[1, Buffer.concat([w(0x7777), w(1200)])]]),
    /InvalidSummaryPropertyType/,
  );
  reject(
    summaryFixture([[1, Buffer.concat([w(2), w(0xffff04b0)])]]),
    /InvalidSummaryPadding/,
  );
  reject(
    summaryFixture([
      [2, text(Buffer.from([0]))],
      [1, cp(1200)],
    ]),
    /InvalidSummaryStringSize/,
  );
  reject(
    summaryFixture([
      [1, cp(1252)],
      [2, Buffer.concat([w(30), w(0xffffffff)])],
    ]),
    /UnexpectedEnd/,
  );
  reject(
    summaryFixture([
      [1, cp(1200)],
      [2, text(Buffer.from([65, 0]))],
    ]),
    /InvalidSummaryTerminator/,
  );
  // Missing codepage leaves codepage-sensitive content opaque instead of guessed.
  reject(
    summaryFixture([[2, Buffer.concat([w(30), w(0xffffffff)])]]),
    /UnexpectedEnd/,
  );
  reject(
    summaryFixture([[2, text(Buffer.from([255]))]]),
    /InvalidSummaryTerminator/,
  );
  summaryActual(
    call,
    summaryFixture([
      [2, text(Buffer.from([255, 0]))],
      [0, Buffer.from([1])],
    ]),
  );
  const badPad = text(Buffer.from("A\0"));
  summaryActual(
    call,
    summaryFixture([
      [2, text(Buffer.from([0xb0, 0xa1, 0]))],
      [1, cp(949)],
    ]),
  );
  summaryActual(
    call,
    summaryFixture([
      [2, text(Buffer.from("😀\0", "utf8"))],
      [1, cp(65001)],
    ]),
  );
  badPad[badPad.length - 1] = 1;
  reject(
    summaryFixture([
      [1, cp(1252)],
      [2, badPad],
    ]),
    /InvalidSummaryPadding/,
  );
  return { pages: 4, rejected, recoveries: rejected };
}
