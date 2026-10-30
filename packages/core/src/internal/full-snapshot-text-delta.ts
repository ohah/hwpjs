// A receipt alone never authorizes reuse: compare the complete owned snapshots.
export function exactDisplayValue(a: any, b: any, budget = { n: 200000 }, depth = 0): boolean {
  if (--budget.n < 0 || depth > 64) return false;
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  if (
    ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(a)) ||
    ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(b))
  )
    return false;
  const aa = Object.getOwnPropertyDescriptors(a),
    bb = Object.getOwnPropertyDescriptors(b),
    ak = Reflect.ownKeys(aa),
    bk = Reflect.ownKeys(bb);
  if (ak.length !== bk.length) return false;
  return ak.every(
    (k) =>
      Object.hasOwn(bb, k) &&
      'value' in aa[k as string] &&
      'value' in bb[k as string] &&
      exactDisplayValue(aa[k as string].value, bb[k as string].value, budget, depth + 1),
  );
}
export function validateFullSnapshotTextDelta(before: any, next: any, packet: any): boolean {
  try {
    // 전체 snapshot의 루트 접근자를 실행해 값 비교로 정규화하지 않습니다.
    // 내부 copy-on-access 루트도 이 최적화에서는 보수적으로 재사용을 거부합니다.
    for (const snapshot of [before, next]) {
      if (
        snapshot === null ||
        typeof snapshot !== 'object' ||
        Reflect.ownKeys(snapshot).some(
          (key) => !('value' in Object.getOwnPropertyDescriptor(snapshot, key)!),
        )
      )
        return false;
    }
    const r = packet?.receipt,
      w = packet?.window,
      b = packet?.before,
      reference = packet?.reference;
    if (
      !r ||
      !w ||
      !b ||
      !reference ||
      before?.format !== 'hwp5' ||
      next?.format !== 'hwp5' ||
      before.readOnly ||
      next.readOnly ||
      before.limited !== false ||
      next.limited !== false ||
      before.window ||
      next.window ||
      before.viewKind ||
      next.viewKind ||
      !Array.isArray(before.paragraphs) ||
      !Array.isArray(next.paragraphs) ||
      before.paragraphs.length !== next.paragraphs.length ||
      !Object.isFrozen(before) ||
      !Object.isFrozen(next)
    )
      return false;
    if (
      r.version !== 1 ||
      r.exclusive !== true ||
      b.epoch !== r.beforeEpoch ||
      w.epoch !== r.epoch ||
      b.section !== r.section ||
      w.section !== r.section ||
      b.sourceNode !== r.sourceNode ||
      w.sourceNode !== r.sourceNode ||
      b.parentNode !== r.parentNode ||
      w.parentNode !== r.parentNode ||
      w.startUnit !== 0 ||
      w.endUnit !== r.totalUnits ||
      w.totalUnits !== r.totalUnits ||
      typeof w.text !== 'string' ||
      w.text.length !== r.totalUnits ||
      w.text.at(-1) !== '\r'
    )
      return false;
    const { paragraphs: ap, ...ah } = before,
      { paragraphs: bp, ...bh } = next;
    if (!exactDisplayValue(ah, bh)) return false;
    let owners = 0;
    for (let i = 0; i < ap.length; i++) {
      const a = ap[i],
        z = bp[i],
        ar = a.currentReference,
        zr = z.currentReference;
      if (
        !ar ||
        !zr ||
        ar.epoch !== r.beforeEpoch ||
        zr.epoch !== r.epoch ||
        ar.scope !== zr.scope ||
        ar.kind !== 'original' ||
        zr.kind !== 'original'
      )
        return false;
      const { epoch: _ae, ...av } = ar,
        { epoch: _ze, ...zv } = zr;
      if (!exactDisplayValue(av, zv)) return false;
      const { currentReference: _ax, ...oldRow } = a,
        { currentReference: _zx, ...newRow } = z;
      if (a.section === r.section && a.paragraph === r.paragraph) {
        owners++;
        if (
          ar.id !== String(r.sourceNode) ||
          !exactDisplayValue(zr, reference) ||
          a.editable !== true ||
          z.editable !== true ||
          a.clipped ||
          z.clipped ||
          a.sourceOffsets ||
          z.sourceOffsets ||
          z.text !== w.text.slice(0, -1) ||
          typeof a.text !== 'string' ||
          typeof z.text !== 'string' ||
          [...a.text, ...z.text].some((c) => c.charCodeAt(0) < 32 || c === '\ufffc')
        )
          return false;
        const { text: _at, characterRanges: _ac, ...restA } = oldRow,
          { text: _zt, characterRanges: zc, ...restZ } = newRow;
        if (!exactDisplayValue(restA, restZ) || !Array.isArray(zc)) return false;
        const ranges: any[] = [];
        for (let j = 0; j < r.runs.length; j++) {
          const start = Math.min(z.text.length, r.runs[j].start_unit),
            end = Math.min(z.text.length, r.runs[j + 1]?.start_unit ?? r.totalUnits),
            id = r.runs[j].char_shape_id;
          if (start === end) {
            if (start === z.text.length) ranges.push({ start, end, charShapeId: id });
            continue;
          }
          const last = ranges.at(-1);
          if (last?.charShapeId === id) last.end = end;
          else ranges.push({ start, end, charShapeId: id });
        }
        if (!exactDisplayValue(ranges, zc)) return false;
      } else if (!exactDisplayValue(oldRow, newRow)) return false;
    }
    return owners === 1;
  } catch {
    return false;
  }
}
