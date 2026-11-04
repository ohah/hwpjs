// 실제 Canvas/Surface와 통제 클립보드의 접수 경계이다. 실제 Native 성공 증거가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { multiblockFixture, tick } from './multiblock-clipboard-fixture.mjs';
async function run(clipboard, body, patch = {}) {
  const f = multiblockFixture();
  if (Object.keys(patch).length) f.install(patch);
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    environment: { clipboard },
  });
  try {
    await f.selectA();
    await body(f, surface);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
test('읽기 전용은 다문단 복사만 허용하고 오려두기는 거부한다', async () => {
  const writes = [];
  const clipboard = {
    writeText: async (text) => {
      writes.push(text);
    },
  };
  await run(
    clipboard,
    async (f, s) => {
      assert.equal(s.canTransferSelection(false, clipboard), true);
      assert.equal(s.canTransferSelection(true, clipboard), false);
      assert.equal(await s.transferSelection({ cut: true, clipboard }), false);
      assert.equal(await s.transferSelection({ clipboard }), true);
      assert.deepEqual(writes, ['BCD\nEF']);
      assert.equal(f.requests.length, 0);
    },
    { capabilities: { readOnly: true } },
  );
});
test('클립보드 거부는 다문단 삭제를 접수하지 않는다', async () => {
  const clipboard = {
    writeText: async () => {
      throw Error('허용하지 않음');
    },
  };
  await run(clipboard, async (f, s) => {
    assert.equal(s.canTransferSelection(true, clipboard), true);
    assert.equal(await s.transferSelection({ cut: true, clipboard }), false);
    assert.equal(f.requests.length, 0);
  });
});
test('클립보드 쓰기 뒤 선택이 바뀌면 삭제하지 않는다', async () => {
  let release;
  const writes = [];
  const clipboard = {
    writeText: (text) => {
      writes.push(text);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  await run(clipboard, async (f, s) => {
    const task = s.transferSelection({ cut: true, clipboard });
    assert.deepEqual(writes, ['BCD\nEF']);
    const before = f.state();
    await f.selectB();
    assert.equal(f.state(), before);
    release();
    assert.equal(await task, false);
    assert.equal(f.requests.length, 0);
  });
});
test('초기 범위 클로저는 일회용이며 쓰기 실패 뒤 재사용하지 않는다', async () => {
  let count = 0;
  const clipboard = {
    writeText: async () => {
      count++;
      throw Error('허용하지 않음');
    },
  };
  await run(clipboard, async (f, s) => {
    const transfer = s.captureTransferSelection({ cut: true, clipboard });
    assert.equal(typeof transfer, 'function');
    assert.equal(await transfer(), false);
    assert.equal(await transfer(), false);
    assert.equal(count, 1);
    assert.equal(f.requests.length, 0);
  });
});
test('명시적 클립보드 없음과 별도 포트의 가용성은 실행과 일치한다', async () => {
  await run(null, async (f, s) => {
    assert.equal(s.canTransferSelection(false), false);
    assert.equal(await s.transferSelection(), false);
    const writes = [];
    const clipboard = {
      writeText: async (text) => {
        writes.push(text);
      },
    };
    assert.equal(s.canTransferSelection(false, clipboard), true);
    assert.equal(await s.transferSelection({ clipboard }), true);
    assert.deepEqual(writes, ['BCD\nEF']);
    assert.equal(f.requests.length, 0);
  });
});

test('현재 다문단 오려두기는 쓰기 완료 뒤 문단 범위 요청 하나만 접수한다', async () => {
  let release;
  const clipboard = {
    writeText: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  };
  await run(clipboard, async (f, s) => {
    const task = s.transferSelection({ cut: true, clipboard });
    assert.equal(f.requests.length, 0);
    release();
    assert.equal(await task, true);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].kind, 'replace-paragraph-ranges');
  });
});
test('명시적 맥 복사와 기존 컨트롤 복사는 같은 다문단 포트를 사용한다', async () => {
  const writes = [];
  const clipboard = {
    writeText: async (text) => {
      writes.push(text);
    },
  };
  await run(clipboard, async (f) => {
    for (const modifier of ['metaKey', 'ctrlKey']) {
      const event = new Event('keydown', { cancelable: true });
      Object.assign(event, { key: 'c', [modifier]: true });
      f.input().dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      await tick();
    }
    assert.deepEqual(writes, ['BCD\nEF', 'BCD\nEF']);
    assert.equal(f.requests.length, 0);
  });
});
test('클립보드 이벤트의 쓰기는 동기 수명 안에 실행된다', async () => {
  await run(null, async (f) => {
    let active = true;
    const writes = [];
    const event = new Event('copy', { cancelable: true });
    Object.assign(event, {
      clipboardData: {
        setData(type, text) {
          assert.equal(active, true);
          writes.push([type, text]);
        },
      },
    });
    f.input().dispatchEvent(event);
    active = false;
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(writes, [['text/plain', 'BCD\nEF']]);
    await tick();
    assert.equal(f.requests.length, 0);
  });
});
test('동기 클립보드 이벤트 쓰기 실패도 삭제하지 않는다', async () => {
  await run(null, async (f) => {
    const event = new Event('cut', { cancelable: true });
    Object.assign(event, {
      clipboardData: {
        setData() {
          throw Error('허용하지 않음');
        },
      },
    });
    f.input().dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    await tick();
    assert.equal(f.requests.length, 0);
  });
});
test('코어 문서 교체 뒤 최초 범위 클로저는 실행하지 않는다', async () => {
  const writes = [];
  const clipboard = {
    writeText: async (text) => {
      writes.push(text);
    },
  };
  await run(clipboard, async (f, s) => {
    const transfer = s.captureTransferSelection({ cut: true, clipboard });
    assert.equal(typeof transfer, 'function');
    f.install({ documentId: 'next', generation: 2 });
    assert.equal(await transfer(), false);
    assert.deepEqual(writes, []);
    assert.equal(f.requests.length, 0);
  });
});
test('다른 셀 소유 문단을 합친 범위는 가용하지 않다', async () => {
  const writes = [];
  const clipboard = {
    writeText: async (text) => {
      writes.push(text);
    },
  };
  await run(clipboard, async (f, s) => {
    f.install({
      content: {
        ...f.state().content,
        paragraphs: f.state().content.paragraphs.map((p, i) => ({
          ...p,
          tableCell: { tableNode: 7, listNode: i + 1 },
        })),
      },
    });
    await f.selectA();
    assert.equal(s.canTransferSelection(false, clipboard), false);
    assert.equal(await s.transferSelection({ cut: true, clipboard }), false);
    assert.deepEqual(writes, []);
    assert.equal(f.requests.length, 0);
  });
});
