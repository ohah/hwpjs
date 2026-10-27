import { createProjectionDataKey } from './paragraph-flow-data-key.mjs';

// currentReference는 최신 표시 모델에서 읽는 선택 권한이며 행 기하에 저장하지 않습니다.
const selectionKeys = new Set(['currentReference']);

export function createParagraphFlowReuse({
  maxEntries = 1024,
  maxRows = 8192,
  maxUnits = 2097152,
} = {}) {
  if (![maxEntries, maxRows, maxUnits].every((v) => Number.isSafeInteger(v) && v > 0))
    throw new RangeError('InvalidParagraphFlowBudget');
  let nativeScope = null;
  let dataKey = createProjectionDataKey();
  let retiredKeyWalkVisits = 0,
    memoGeneration = 0;
  const paragraphKey = (p, allowNative = true) => {
    const stamp = allowNative ? nativeScope?.stamp(p) : null;
    if (stamp !== null && stamp !== undefined) {
      counts.nativeParagraphBypass++;
      return stamp;
    }
    counts.paragraphKeyCalls++;
    return dataKey(p, 65536, () => {}, selectionKeys);
  };
  let entries = new Map(),
    units = 0,
    rowCount = 0,
    environmentKey = null,
    enabled = false,
    disabledReason = null,
    boundaryIdentity = null;
  const counts = {
    hits: 0,
    misses: 0,
    fallbacks: 0,
    calculatedParagraphs: 0,
    copiedRows: 0,
    storeRowsCopied: 0,
    rejectedRowsBeforeClone: 0,
    scopeFallbacks: 0,
    nativeEnvironmentBypass: 0,
    nativeParagraphBypass: 0,
    environmentKeyCalls: 0,
    paragraphKeyCalls: 0,
  };
  const clear = () => {
    nativeScope = null;
    retiredKeyWalkVisits += dataKey.stats().visits;
    memoGeneration++;
    dataKey = createProjectionDataKey();
    entries.clear();
    units = 0;
    rowCount = 0;
    environmentKey = null;
    boundaryIdentity = null;
    enabled = false;
  };
  return {
    clear,
    beginNative(value) {
      if (!value || !value.key || typeof value.stamp !== 'function') {
        clear();
        return;
      }
      if (environmentKey !== value.key) clear();
      environmentKey = value.key;
      nativeScope = value;
      enabled = true;
      disabledReason = null;
      counts.nativeEnvironmentBypass++;
    },
    begin(environment, identity) {
      nativeScope = null;
      counts.environmentKeyCalls++;
      if (identity === null || identity === undefined) {
        clear();
        disabledReason = 'UnknownTextBoundaryPolicy';
        return;
      }
      let reason = null;
      const key = dataKey(environment, 262144, (value) => {
        reason = value;
      });
      if (key === null || key !== environmentKey || identity !== boundaryIdentity) clear();
      environmentKey = key;
      boundaryIdentity = identity;
      enabled = key !== null;
      disabledReason = reason;
    },
    stats: () => ({
      ...counts,
      keyMemo: dataKey.stats(),
      memoGeneration,
      totalKeyWalkVisits: retiredKeyWalkVisits + dataKey.stats().visits,
      enabled,
      disabledReason,
      entries: entries.size,
      units,
      rows: rowCount,
    }),
    scope(content, width, options) {
      if (!enabled) return null;
      const context = dataKey({
        format: content.format,
        pictureFlowContext: content.pictureFlowContext,
        width,
        ...options,
      });
      if (context === null) {
        counts.scopeFallbacks++;
        return null;
      }
      const pictures = new Set(),
        duplicates = new Set(),
        ids = new Set();
      for (const p of content.paragraphs) {
        const id = JSON.stringify([p.section, p.paragraph]);
        if (ids.has(id)) duplicates.add(id);
        ids.add(id);
      }
      for (const p of content.pictures ?? [])
        pictures.add(JSON.stringify([p.section, p.paragraph]));
      return {
        lookup(p, remaining, flowPictures, terminal) {
          const id = JSON.stringify([p.section, p.paragraph]);
          if (duplicates.has(id) || pictures.has(id) || flowPictures.length || content.limited) {
            counts.fallbacks++;
            return null;
          }
          // wrapper 측정 의존성은 위 context의 정확한 값 검증에 이미 포함됩니다.
          // 원본 행만 Native stamp를 받을 수 있고 파생 행은 값 검증으로 돌아갑니다.
          const allowNative = true;
          const signature = paragraphKey(p, allowNative);
          if (signature === null) {
            counts.fallbacks++;
            return null;
          }
          const key = context + ':' + id + ':' + terminal;
          const old = entries.get(key);
          if (old?.signature === signature && old.rows.length <= remaining) {
            counts.hits++;
            counts.copiedRows += old.rows.length;
            return { value: structuredClone({ rows: old.rows, height: old.height }) };
          }
          counts.misses++;
          return {
            store(sourceRows, height, startRow = 0, originY = 0) {
              counts.calculatedParagraphs++;
              if (paragraphKey(p, allowNative) !== signature) {
                counts.fallbacks++;
                return;
              }
              const length = sourceRows.length - startRow;
              if (length > maxRows) {
                counts.rejectedRowsBeforeClone += length;
                return;
              }
              const rows = [];
              for (let index = startRow; index < sourceRows.length; index++)
                rows.push({ ...sourceRows[index], y: sourceRows[index].y - originY });
              const encoded = dataKey(rows, maxUnits);
              if (encoded === null) return;
              const size = encoded.length + signature.length + key.length;
              if (size > maxUnits) return;
              let copy;
              try {
                copy = structuredClone(rows);
                counts.storeRowsCopied += rows.length;
              } catch {
                counts.fallbacks++;
                return;
              }
              const replaced = entries.get(key);
              if (replaced) {
                entries.delete(key);
                units -= replaced.size;
                rowCount -= replaced.rows.length;
              }
              // 제한을 넘으면 이번 결과만 보관합니다. 무제한 이전 revision 축적은 하지 않습니다.
              if (
                entries.size >= maxEntries ||
                units + size > maxUnits ||
                rowCount + copy.length > maxRows
              ) {
                entries.clear();
                units = 0;
                rowCount = 0;
              }
              entries.set(key, { signature, rows: copy, height, size });
              units += size;
              rowCount += copy.length;
            },
          };
        },
      };
    },
  };
}

// 측정 함수를 감싼 호출자는 바뀐 측정 의미의 의존성도 함께 전달합니다.
export function withParagraphFlowReuse(base, wrapper, dependency) {
  if (base.paragraphFlowReuse)
    wrapper.paragraphFlowReuse = {
      scope(content, width, options) {
        return base.paragraphFlowReuse.scope(content, width, {
          ...options,
          measurementOverrides: [
            ...(options.measurementOverrides ?? []),
            typeof dependency === 'function' ? dependency() : dependency,
          ],
        });
      },
    };
  return wrapper;
}
