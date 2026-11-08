import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readDocuments, BATCH_READ_LIMITS } from '../src/batch-read.ts';

const good = (text = '', format = 'hwp5') => ({ format, sourceSha256: 'a'.repeat(64), text });
const later = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const serializedBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

function bounded(result, limit) {
  assert.equal(result.outputBytes, serializedBytes(result));
  assert.ok(result.outputBytes <= limit);
  assert.equal(result.results.length, result.summary.total);
}

test('기본 직렬 실행은 빈 본문을 허용하고 입력 순서와 성공 메타데이터를 보존한다', async () => {
  const events = [];
  const result = await readDocuments({
    inputPaths: ['b.hwp', 'a.hwpx'],
    readOne: async ({ inputPath, index }) => {
      events.push(['시작', inputPath, index]);
      await tick();
      events.push(['종료', inputPath, index]);
      return good(index ? '본문' : '', index ? 'hwpx' : 'hwp5');
    },
  });
  assert.deepEqual(
    events.map((row) => row[0]),
    ['시작', '종료', '시작', '종료'],
  );
  assert.deepEqual(
    result.results.map((row) => row.inputPath),
    ['b.hwp', 'a.hwpx'],
  );
  assert.equal(result.status, 'success');
  assert.equal(result.summary.readSucceeded, 2);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.results[0].value.text, '');
  assert.equal(result.results[0].deliveryStatus, 'not-requested');
  bounded(result, BATCH_READ_LIMITS.defaultOutputBytes);
});

test('선행 읽기와 전달이 늦어도 실행 및 완료 대기 슬롯의 합계는 최대 2개다', async () => {
  const first = later();
  const delivery = later();
  const started = [];
  const delivered = [];
  let maximum = 0;
  const work = readDocuments({
    inputPaths: ['0', '1', '2', '3', '4'],
    concurrency: 2,
    readOne: async ({ index }) => {
      started.push(index);
      maximum = Math.max(maximum, started.length - delivered.length);
      if (index === 0) await first.promise;
      return good(String(index));
    },
    onResult: async (row) => {
      if (row.index === 0) await delivery.promise;
      delivered.push(row.index);
    },
  });
  await tick();
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(delivered, []);
  first.resolve();
  await tick();
  assert.deepEqual(started, [0, 1]);
  delivery.resolve();
  const result = await work;
  assert.ok(maximum <= 2);
  assert.deepEqual(delivered, [0, 1, 2, 3, 4]);
  assert.deepEqual(
    result.results.map((row) => row.index),
    [0, 1, 2, 3, 4],
  );
  assert.equal(result.status, 'success');
});

test('완료 순서가 뒤집혀도 출력 예산은 입력 순서대로 승인한다', async () => {
  async function run(reverse) {
    const a = later();
    const b = later();
    const work = readDocuments({
      inputPaths: ['앞', '뒤'],
      concurrency: 2,
      maxOutputBytes: 6000,
      readOne: ({ index }) => (index ? b.promise : a.promise),
    });
    if (reverse) {
      b.resolve(good('b'.repeat(3000)));
      await tick();
      a.resolve(good('a'.repeat(3000)));
    } else {
      a.resolve(good('a'.repeat(3000)));
      await tick();
      b.resolve(good('b'.repeat(3000)));
    }
    return work;
  }
  const forward = await run(false);
  const reverse = await run(true);
  assert.deepEqual(reverse, forward);
  assert.equal(reverse.results[0].status, 'success');
  assert.equal(reverse.results[1].errors[0].code, 'OutputBudgetExceeded');
  assert.equal(reverse.results[1].readStatus, 'success');
  assert.equal(reverse.results[1].value, null);
  assert.equal(reverse.status, 'partial');
  bounded(reverse, 6000);
});

test('전체 직렬화 결과의 UTF-8와 JSON 이스케이프를 예산에 포함한다', async () => {
  const text = '🙂한글\n"\\\u0000'.repeat(60);
  const result = await readDocuments({
    inputPaths: ['자료🙂.hwp'],
    maxOutputBytes: 6000,
    readOne: () => good(text),
  });
  assert.equal(result.results[0].value.text, text);
  assert.equal(result.results[0].status, 'success');
  bounded(result, 6000);
});

test('큰 본문은 절단하지 않고 예산 오류로 표시하며 다른 입력은 계속 읽는다', async () => {
  const seen = [];
  const result = await readDocuments({
    inputPaths: ['큰문서', '다음문서'],
    maxOutputBytes: 6000,
    readOne: ({ index }) => {
      seen.push(index);
      return good(index === 0 ? 'x'.repeat(10000) : '다음 본문');
    },
  });
  assert.deepEqual(seen, [0, 1]);
  assert.equal(result.results[0].readStatus, 'success');
  assert.equal(result.results[0].outputStatus, 'failure');
  assert.equal(result.results[0].value, null);
  assert.equal(result.results[0].errors[0].code, 'OutputBudgetExceeded');
  assert.equal(result.results[1].value.text, '다음 본문');
  assert.equal(result.status, 'partial');
  bounded(result, 6000);
});

test('전달 실패는 이미 읽은 본문과 읽기 성공을 보존하고 자동 재시도하지 않는다', async () => {
  let reads = 0;
  let hooks = 0;
  const text = '원래 읽은 본문';
  const result = await readDocuments({
    inputPaths: ['하나'],
    maxOutputBytes: 7000,
    readOne: () => {
      reads++;
      return good(text);
    },
    onResult: () => {
      hooks++;
      throw Error('\0'.repeat(300));
    },
  });
  const row = result.results[0];
  assert.equal(reads, 1);
  assert.equal(hooks, 1);
  assert.equal(row.readStatus, 'success');
  assert.equal(row.outputStatus, 'success');
  assert.equal(row.deliveryStatus, 'failure');
  assert.equal(row.value.text, text);
  assert.equal(row.status, 'failure');
  assert.equal(row.errors[0].code, 'ResultHookFailed');
  assert.equal(row.errors[0].detail.length, 256);
  assert.equal(result.summary.readSucceeded, 1);
  assert.equal(result.summary.deliveryFailed, 1);
  assert.equal(result.summary.succeeded, 0);
  bounded(result, 7000);
});

test('호스트의 전달 객체 변경은 결과나 읽기 콜백의 원본 객체를 바꾸지 않는다', async () => {
  const raw = good('검증된 본문');
  const result = await readDocuments({
    inputPaths: ['원문'],
    readOne: () => raw,
    onResult: (row) => {
      assert.equal(row.deliveryStatus, 'pending');
      row.value.text = '전달 객체 변경';
      row.errors.push({ code: '추가' });
      row.inputPath = '경로 변경';
      raw.text = '콜백 원본 변경';
    },
  });
  assert.equal(result.results[0].value.text, '검증된 본문');
  assert.equal(result.results[0].inputPath, '원문');
  assert.deepEqual(result.results[0].errors, []);
});

test('읽기 실패와 전달 실패를 함께 남기고 나머지 작업도 완료한다', async () => {
  const hooks = [];
  const result = await readDocuments({
    inputPaths: ['실패', '성공'],
    concurrency: 2,
    readOne: ({ index }) => {
      if (index === 0) throw Error('파일 접근 실패');
      return good('성공');
    },
    onResult: (row) => {
      hooks.push(row.index);
      if (row.index === 0) throw Error('전달 실패');
    },
  });
  assert.deepEqual(hooks, [0, 1]);
  assert.deepEqual(
    result.results[0].errors.map((e) => e.code),
    ['ReadFailed', 'ResultHookFailed'],
  );
  assert.equal(result.results[1].status, 'success');
  assert.equal(result.status, 'partial');
});

test('개별 거부와 비동기 정리가 끝나기 전에 배치 완료를 반환하지 않는다', async () => {
  const cleanup = later();
  const second = later();
  const events = [];
  let settled = false;
  const work = readDocuments({
    inputPaths: ['거부', '대기'],
    concurrency: 2,
    readOne: async ({ index }) => {
      if (index === 1) {
        await second.promise;
        events.push('두번째 종료');
        return good('완료');
      }
      try {
        throw Error('읽기 거부');
      } finally {
        await cleanup.promise;
        events.push('첫번째 정리');
      }
    },
  }).then((value) => {
    settled = true;
    return value;
  });
  await tick();
  assert.equal(settled, false);
  cleanup.resolve();
  await tick();
  assert.equal(settled, false);
  second.resolve();
  const result = await work;
  assert.deepEqual(events, ['첫번째 정리', '두번째 종료']);
  assert.equal(result.results[0].errors[0].code, 'ReadFailed');
  assert.equal(result.results[1].status, 'success');
});

test('입력 배열과 읽기 결과의 변경 가능한 외곽 객체를 호출 경계에서 분리한다', async () => {
  const paths = ['처음', '다음'];
  const pause = later();
  const seen = [];
  const work = readDocuments({
    inputPaths: paths,
    readOne: async ({ inputPath, index }) => {
      seen.push(inputPath);
      if (index === 0) await pause.promise;
      return good(inputPath);
    },
  });
  paths[1] = '바뀐 경로';
  paths.push('추가 경로');
  pause.resolve();
  const result = await work;
  assert.deepEqual(seen, ['처음', '다음']);
  assert.deepEqual(
    result.results.map((row) => row.inputPath),
    ['처음', '다음'],
  );
});

for (const [name, raw] of [
  ['null', null],
  ['배열', []],
  ['문자열', '본문'],
  ['지원하지 않는 포맷', { ...good(), format: 'html' }],
  ['SHA 누락', { format: 'hwp5', text: '본문' }],
  ['잘못된 SHA', { ...good(), sourceSha256: 'A'.repeat(64) }],
  ['잘못된 UTF16', good('\ud800')],
  ['문자열 아닌 본문', { ...good(), text: new Uint8Array([1]) }],
]) {
  test(`비정상 읽기 콜백 결과를 성공으로 취급하지 않는다: ${name}`, async () => {
    const result = await readDocuments({
      inputPaths: ['이상', '정상'],
      readOne: ({ index }) => (index ? good('정상') : raw),
    });
    assert.equal(result.results[0].errors[0].code, 'InvalidReadResult');
    assert.equal(result.results[0].value, null);
    assert.equal(result.results[1].status, 'success');
    assert.equal(result.status, 'partial');
  });
}

test('결과 getter 오류와 primitive 거부도 해당 파일의 실패로만 처리한다', async () => {
  const result = await readDocuments({
    inputPaths: ['getter', '거부', '정상'],
    readOne: ({ index }) => {
      if (index === 0)
        return {
          get format() {
            throw Error('관측 getter 실패');
          },
        };
      if (index === 1) return Promise.reject(undefined);
      return good('정상');
    },
  });
  assert.deepEqual(
    result.results.map((row) => row.status),
    ['failure', 'failure', 'success'],
  );
  assert.equal(result.results[0].errors[0].code, 'InvalidReadResult');
  assert.equal(result.results[1].errors[0].code, 'ReadFailed');
});

test('128개 상한의 모든 실패를 숨기지 않고 입력 순서대로 반환한다', async () => {
  const paths = Array.from({ length: 128 }, (_, index) => '경로' + index);
  const result = await readDocuments({
    inputPaths: paths,
    concurrency: 2,
    readOne: () => {
      throw Error('실패');
    },
  });
  assert.equal(result.results.length, 128);
  assert.equal(result.status, 'failure');
  assert.equal(result.summary.failed, 128);
  assert.deepEqual(
    result.results.map((row) => row.inputPath),
    paths,
  );
  bounded(result, BATCH_READ_LIMITS.defaultOutputBytes);
});

test('빈 입력·중복·비정상 설정·실패표시 예산 부족은 읽기 전에 거부한다', async () => {
  let calls = 0;
  const readOne = () => {
    calls++;
    return good();
  };
  for (const [options, code] of [
    [{ inputPaths: [] }, 'InvalidInputPaths'],
    [{ inputPaths: ['같음', '같음'] }, 'DuplicateInputPath'],
    [{ inputPaths: Array(129).fill('경로') }, 'InvalidInputPaths'],
    [{ inputPaths: [''] }, 'InvalidInputPath'],
    [{ inputPaths: ['\ud800'] }, 'InvalidInputPath'],
    [{ inputPaths: ['줄\n바꿈'] }, 'InvalidInputPath'],
    [{ inputPaths: [undefined] }, 'InvalidInputPath'],
    [{ inputPaths: ['x'.repeat(4097)] }, 'InvalidInputPath'],
    [{ concurrency: 0 }, 'InvalidConcurrency'],
    [{ concurrency: 3 }, 'InvalidConcurrency'],
    [{ concurrency: 1.5 }, 'InvalidConcurrency'],
    [{ maxOutputBytes: 0 }, 'InvalidOutputBudget'],
    [{ maxOutputBytes: 16777217 }, 'InvalidOutputBudget'],
    [{ maxOutputBytes: 1 }, 'OutputBudgetTooSmall'],
    [{ onResult: true }, 'InvalidResultHook'],
    [{ readOne: null }, 'InvalidReadRunner'],
  ]) {
    await assert.rejects(
      readDocuments({ inputPaths: ['경로'], readOne, ...options }),
      (error) => error.code === code,
    );
  }
  assert.equal(calls, 0);
});

test('읽기 결과의 부가 순환 객체나 직렬화 메서드는 내부 결과에 들어가지 않는다', async () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const result = await readDocuments({
    inputPaths: ['원문'],
    readOne: () => ({
      ...good('안전한 본문'),
      cyclic,
      toJSON() {
        throw Error('실행되면 안 되는 직렬화');
      },
    }),
  });
  assert.deepEqual(Object.keys(result.results[0].value), ['format', 'sourceSha256', 'text']);
  assert.equal(result.results[0].value.text, '안전한 본문');
});

test('여러 입력·동시성·전달 오류·Unicode 조합에서도 반환 전체가 예산 안에 들어간다', async () => {
  for (const count of [1, 2, 10])
    for (const concurrency of [1, 2])
      for (const maxOutputBytes of [4000, 8000, 20000, 80000]) {
        let calls = 0;
        const inputPaths = Array.from({ length: count }, (_, index) => '자료🙂' + index);
        try {
          const result = await readDocuments({
            inputPaths,
            concurrency,
            maxOutputBytes,
            readOne: ({ index }) => {
              calls++;
              if (index % 4 === 3) throw Error('\0'.repeat(300));
              return good('🙂"\n\\가'.repeat(index * 80));
            },
            onResult: (row) => {
              if (row.index % 3 === 0) throw Error('\0'.repeat(300));
            },
          });
          bounded(result, maxOutputBytes);
          assert.equal(calls, count);
          for (const row of result.results)
            if (row.outputStatus === 'success')
              assert.equal(row.value.text, '🙂"\n\\가'.repeat(row.index * 80));
        } catch (error) {
          assert.equal(error.code, 'OutputBudgetTooSmall');
          assert.equal(calls, 0);
        }
      }
});

test('첫 인덱스 getter가 129개로 늘려도 최초 길이만큼만 읽고 반복기는 조회하지 않는다', async () => {
  const paths = ['초기'];
  const seen = [];
  Object.defineProperty(paths, '0', {
    get() {
      for (let index = 1; index < 129; index++) paths[index] = '추가' + index;
      return '초기';
    },
  });
  Object.defineProperty(paths, Symbol.iterator, {
    get() {
      throw Error('입력 배열의 반복기에 접근하면 안 됩니다.');
    },
  });
  const result = await readDocuments({
    inputPaths: paths,
    readOne: ({ inputPath }) => {
      seen.push(inputPath);
      return good();
    },
  });
  assert.equal(paths.length, 129);
  assert.deepEqual(seen, ['초기']);
  assert.equal(result.summary.total, 1);
});

test('길이가 줄어도 고정 인덱스를 읽으며 삭제된 경로는 작업 시작 전에 거부한다', async () => {
  const paths = ['처음', '삭제될 경로'];
  Object.defineProperty(paths, '0', {
    get() {
      paths.length = 1;
      return '처음';
    },
  });
  let calls = 0;
  await assert.rejects(
    readDocuments({
      inputPaths: paths,
      readOne: () => {
        calls++;
        return good();
      },
    }),
    (error) => error.code === 'InvalidInputPath',
  );
  assert.equal(paths.length, 1);
  assert.equal(calls, 0);
});

test('Proxy가 길이를 줄여도 최초 두 인덱스가 유효하면 두 작업을 유지한다', async () => {
  const target = ['처음', '두번째'];
  const reads = [];
  let lengthReads = 0;
  const paths = new Proxy(target, {
    get(array, key, receiver) {
      if (key === 'length') {
        lengthReads++;
        return Reflect.get(array, key, receiver);
      }
      if (key === '0') {
        array.length = 1;
        reads.push(0);
        return '처음';
      }
      if (key === '1') {
        reads.push(1);
        return '두번째';
      }
      return Reflect.get(array, key, receiver);
    },
  });
  const result = await readDocuments({
    inputPaths: paths,
    readOne: ({ inputPath }) => good(inputPath),
  });
  assert.deepEqual(reads, [0, 1]);
  assert.equal(lengthReads, 1);
  assert.equal(result.summary.total, 2);
  assert.deepEqual(
    result.results.map((row) => row.value.text),
    ['처음', '두번째'],
  );
});

test('Proxy 길이는 한 번만 조회하고 정수·상한 검증 뒤 재조회하지 않는다', async () => {
  let lengthReads = 0;
  const paths = new Proxy(['가', '나'], {
    get(array, key, receiver) {
      if (key === 'length') {
        lengthReads++;
        if (lengthReads !== 1) throw Error('길이를 다시 읽으면 안 됩니다.');
        return 2;
      }
      return Reflect.get(array, key, receiver);
    },
  });
  const result = await readDocuments({ inputPaths: paths, readOne: () => good() });
  assert.equal(lengthReads, 1);
  assert.equal(result.summary.total, 2);
  for (const value of [2.5, '2', NaN, undefined, 0, 129]) {
    let calls = 0;
    const invalid = new Proxy(['가', '나', '다'], {
      get(array, key, receiver) {
        return key === 'length' ? value : Reflect.get(array, key, receiver);
      },
    });
    await assert.rejects(
      readDocuments({
        inputPaths: invalid,
        readOne: () => {
          calls++;
          return good();
        },
      }),
      (error) => error.code === 'InvalidInputPaths',
    );
    assert.equal(calls, 0);
  }
});

test('Node 전용 모듈과 전역 없이 스케줄러를 실행할 수 있다', () => {
  const url = new URL('../src/batch-read.ts', import.meta.url).href;
  const program = `import assert from 'node:assert/strict'; import {registerHooks} from 'node:module';
    registerHooks({resolve(name,context,next){if(name.startsWith('node:')||(!name.startsWith('.')&&!name.startsWith('file:')))throw Error('Node 의존성 금지');return next(name,context)}});
    globalThis.Buffer=undefined;globalThis.process=undefined;globalThis.require=undefined;globalThis.module=undefined;
    const {readDocuments}=await import(${JSON.stringify(url)});
    const result=await readDocuments({inputPaths:['자료'],readOne:()=>({format:'hwpx',sourceSha256:'a'.repeat(64),text:'공통 읽기'})});
    assert.equal(result.status,'success');assert.equal(result.results[0].value.text,'공통 읽기');`;
  const child = spawnSync(
    process.execPath,
    ['--max-old-space-size=256', '--input-type=module', '-e', program],
    { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 },
  );
  assert.equal(child.status, 0, child.stderr);
});
