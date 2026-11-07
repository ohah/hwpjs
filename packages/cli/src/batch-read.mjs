export const BATCH_READ_LIMITS = Object.freeze({
  maxInputs: 128,
  maxConcurrency: 2,
  defaultOutputBytes: 4 * 1024 * 1024,
  maxOutputBytes: 16 * 1024 * 1024,
  maxInputPathUnits: 4096,
  maxErrorDetailUnits: 256,
});

const messages = Object.freeze({
  ReadFailed: '문서 읽기 작업에 실패했습니다.',
  InvalidReadResult: '읽기 콜백의 결과 형식이 올바르지 않습니다.',
  OutputBudgetExceeded: '문서 결과가 배치 출력 예산을 초과했습니다. 본문을 절단하지 않았습니다.',
  ResultHookFailed:
    '결과 전달 콜백에 실패했습니다. 이미 읽은 결과와 발생한 부작용은 취소되지 않습니다.',
});

function argumentError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function detail(error) {
  try {
    const value = typeof error?.message === 'string' ? error.message : String(error);
    return value.slice(0, BATCH_READ_LIMITS.maxErrorDetailUnits).toWellFormed();
  } catch {
    return '오류의 상세 설명을 읽지 못했습니다.';
  }
}

function failure(phase, code, error) {
  return {
    phase,
    code,
    message: messages[code],
    ...(error === undefined ? {} : { detail: detail(error) }),
  };
}

// JSON으로 직렬화한 문자열의 UTF-8 길이만 계산하며 별도 바이트 버퍼는 만들지 않습니다.
function utf8Length(text, limit = Infinity) {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index++;
    } else bytes += 3;
    if (bytes > limit) return bytes;
  }
  return bytes;
}
const recordBytes = (record, limit) => utf8Length(JSON.stringify(record), limit);

function errorRecord(index, inputPath, code, error, readStatus = 'failure') {
  return {
    index,
    inputPath,
    status: 'failure',
    readStatus,
    outputStatus: 'failure',
    deliveryStatus: 'not-requested',
    value: null,
    errors: [failure(code === 'OutputBudgetExceeded' ? 'output' : 'read', code, error)],
  };
}

function copyRecord(record) {
  return {
    ...record,
    value: record.value === null ? null : { ...record.value },
    errors: record.errors.map((error) => ({ ...error })),
  };
}

function validateReadResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { format, sourceSha256, text } = value;
  if (
    !['hwp5', 'hwpx'].includes(format) ||
    typeof sourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(sourceSha256) ||
    typeof text !== 'string' ||
    !text.isWellFormed()
  )
    return null;
  // 콜백의 부가 객체와 원문 버퍼를 보관하지 않고 검증된 불변 스칼라만 복사합니다.
  return { format, sourceSha256, text };
}

function hasPathControl(text) {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * 명시된 경로를 기존 단일 읽기 콜백으로 처리하는 내부 결과 모델입니다.
 * 문서 전체 JSON 변환 명령이나 Rust 변환기와의 출력 동치를 제공하지 않습니다.
 * 경로 발견·정규화·입력 스냅샷·Native 원문 수명·무변경 읽기는 호스트의 readOne 책임입니다.
 * 이 모듈은 파일시스템·Native·네트워크를 직접 호출하지 않습니다.
 * 관리 비용은 입력과 결과 바이트에 비례하며 Native 파싱 비용은 포함하지 않습니다.
 */
export async function readDocuments({
  inputPaths,
  readOne,
  concurrency = 1,
  maxOutputBytes = BATCH_READ_LIMITS.defaultOutputBytes,
  onResult,
} = {}) {
  // 외부 배열·Proxy의 길이는 한 번만 포착합니다. 인덱스 getter가 이후
  // 원본 길이를 바꿔도 검사 범위와 스냅샷 수집 범위가 달라지면 안 됩니다.
  const inputCount = Array.isArray(inputPaths) ? inputPaths.length : 0;
  if (!Number.isInteger(inputCount) || inputCount < 1 || inputCount > BATCH_READ_LIMITS.maxInputs)
    throw argumentError(
      'InvalidInputPaths',
      '입력 경로는 1개 이상 128개 이하의 배열이어야 합니다.',
    );
  if (typeof readOne !== 'function')
    throw argumentError('InvalidReadRunner', '단일 읽기 콜백이 필요합니다.');
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > BATCH_READ_LIMITS.maxConcurrency
  )
    throw argumentError('InvalidConcurrency', '동시 작업 수는 1 또는 2여야 합니다.');
  if (
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1 ||
    maxOutputBytes > BATCH_READ_LIMITS.maxOutputBytes
  )
    throw argumentError(
      'InvalidOutputBudget',
      '출력 예산은 1바이트 이상 16MiB 이하의 정수여야 합니다.',
    );
  if (onResult !== undefined && typeof onResult !== 'function')
    throw argumentError('InvalidResultHook', '결과 전달 콜백은 함수여야 합니다.');
  const paths = [];
  const seen = new Map();
  for (let index = 0; index < inputCount; index++) {
    const path = inputPaths[index];
    if (
      typeof path !== 'string' ||
      path.length < 1 ||
      path.length > BATCH_READ_LIMITS.maxInputPathUnits ||
      !path.isWellFormed() ||
      hasPathControl(path)
    )
      throw argumentError(
        'InvalidInputPath',
        '입력 경로는 제어 문자 없는 올바른 Unicode 문자열이어야 합니다.',
      );
    if (seen.has(path)) throw argumentError('DuplicateInputPath', '중복된 입력 경로가 있습니다.');
    seen.set(path, index);
    paths.push(path);
  }
  const count = paths.length;
  const makeEnvelope = (results, summary) => ({
    schemaVersion: 1,
    status: 'partial',
    results,
    summary,
    limits: { maxOutputBytes, concurrency },
    outputBytes: maxOutputBytes,
  });
  const maximumSummary = {
    total: count,
    readSucceeded: count,
    readFailed: count,
    outputFailed: count,
    deliveryFailed: count,
    succeeded: count,
    failed: count,
  };
  // 모든 입력의 실패를 표시할 공간과 전달 실패 상세 공간을 먼저 확보합니다.
  // 제어 문자 하나는 JSON에서 최대 6바이트이므로 이 상세 문자열은 상한 예약입니다.
  const worstDetail = '\0'.repeat(BATCH_READ_LIMITS.maxErrorDetailUnits);
  const worstHook = { ...failure('delivery', 'ResultHookFailed'), detail: worstDetail };
  const reservations = paths.map((path, index) => {
    let maximum = 0;
    for (const code of ['ReadFailed', 'InvalidReadResult', 'OutputBudgetExceeded']) {
      const row = errorRecord(index, path, code);
      row.errors[0].detail = worstDetail;
      if (onResult) row.errors.push(worstHook);
      maximum = Math.max(maximum, recordBytes(row));
    }
    return maximum;
  });
  let remaining = reservations.reduce((sum, size) => sum + size, 0);
  let used = recordBytes(makeEnvelope([], maximumSummary)) + count - 1;
  if (used + remaining > maxOutputBytes)
    throw argumentError(
      'OutputBudgetTooSmall',
      '모든 입력의 실패 상태를 표시하기에도 출력 예산이 부족합니다.',
    );
  const results = Array(count);
  const gates = Array.from({ length: count + 1 }, gate);
  gates[0].release();
  let nextIndex = 0;

  async function runOne(index) {
    let raw;
    try {
      raw = await readOne({ inputPath: paths[index], index });
    } catch (error) {
      return errorRecord(index, paths[index], 'ReadFailed', error);
    }
    let value;
    try {
      value = validateReadResult(raw);
    } catch (error) {
      return errorRecord(index, paths[index], 'InvalidReadResult', error);
    }
    if (!value) return errorRecord(index, paths[index], 'InvalidReadResult');
    if (value.text.length > maxOutputBytes)
      return errorRecord(index, paths[index], 'OutputBudgetExceeded', undefined, 'success');
    return {
      index,
      inputPath: paths[index],
      status: 'success',
      readStatus: 'success',
      outputStatus: 'success',
      deliveryStatus: 'not-requested',
      value,
      errors: [],
    };
  }

  async function finish(index, record) {
    remaining -= reservations[index];
    const worst = copyRecord(record);
    if (onResult) worst.errors.push(worstHook);
    // 입력 순서대로만 예산을 승인합니다. 읽기 성공의 전달 실패도 본문과 함께 들어가야 합니다.
    if (used + remaining + recordBytes(worst, maxOutputBytes) > maxOutputBytes) {
      record = errorRecord(
        index,
        paths[index],
        'OutputBudgetExceeded',
        undefined,
        record.readStatus,
      );
    }
    if (onResult) {
      record.deliveryStatus = 'pending';
      try {
        await onResult(copyRecord(record));
        record.deliveryStatus = 'success';
      } catch (error) {
        record.deliveryStatus = 'failure';
        record.status = 'failure';
        record.errors.push(failure('delivery', 'ResultHookFailed', error));
      }
    }
    results[index] = record;
    used += recordBytes(record);
  }

  async function worker() {
    while (nextIndex < count) {
      const index = nextIndex++;
      const record = await runOne(index);
      // 완료 결과도 입력 순서 승인과 hook 종료까지 슬롯을 점유하므로 최대 2개만 대기합니다.
      await gates[index].promise;
      try {
        await finish(index, record);
      } finally {
        gates[index + 1].release();
      }
    }
  }
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, count) }, worker),
  );
  const failures = settled.filter((row) => row.status === 'rejected').map((row) => row.reason);
  if (failures.length)
    throw new AggregateError(
      failures,
      '배치 읽기 관리 중 오류가 발생했습니다. 시작한 작업은 모두 종료됐습니다.',
    );
  const summary = {
    total: count,
    readSucceeded: 0,
    readFailed: 0,
    outputFailed: 0,
    deliveryFailed: 0,
    succeeded: 0,
    failed: 0,
  };
  for (const row of results) {
    summary[row.readStatus === 'success' ? 'readSucceeded' : 'readFailed']++;
    if (row.outputStatus === 'failure') summary.outputFailed++;
    if (row.deliveryStatus === 'failure') summary.deliveryFailed++;
    summary[row.status === 'success' ? 'succeeded' : 'failed']++;
  }
  const result = makeEnvelope(results, summary);
  result.status =
    summary.failed === 0 ? 'success' : summary.succeeded === 0 ? 'failure' : 'partial';
  result.outputBytes = 0;
  // 자기 자신의 길이 필드는 십진 자릿수만 변하므로 최대 4번이면 고정됩니다.
  for (let pass = 0; pass < 4; pass++) {
    const size = recordBytes(result);
    if (size === result.outputBytes) break;
    result.outputBytes = size;
  }
  if (recordBytes(result) !== result.outputBytes || result.outputBytes > maxOutputBytes)
    throw new Error('배치 결과의 출력 예산 검증에 실패했습니다.');
  return result;
}
