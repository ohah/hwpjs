import { footnoteTextReference } from './footnote-reference-rows.mjs';

// 잠근 순간의 값 snapshot만 검사합니다. 공개 편집 reference나 Native 권위를 발급하지 않습니다.
export function createFootnoteLockAudit(counters) {
  const locks = new Map();
  let revision = 0;
  let scanRevision = -1;
  let epoch = 0;
  let found = 0;
  let bad = false;
  let permanentBad = false;
  let active = false;
  let complete = false;
  const count = (key, amount = 1) => {
    if (counters) counters[key] = (counters[key] ?? 0) + amount;
  };
  const sameSource = (lock, row) =>
    row.section === lock.section &&
    row.paragraph === lock.paragraph &&
    row.startUnit === lock.startUnit &&
    row.endUnit === lock.endUnit;
  return {
    register(key, note, row) {
      revision++;
      count('registrations');
      const reference = Object.freeze({
        section: note?.section,
        hostParagraph: note?.hostParagraph,
        anchorUnit: note?.anchorUnit,
      });
      count('registrationReferenceChecks');
      if (
        !Number.isSafeInteger(reference.section) ||
        reference.section < 0 ||
        !Number.isSafeInteger(reference.hostParagraph) ||
        reference.hostParagraph < 0 ||
        !Number.isSafeInteger(reference.anchorUnit) ||
        reference.anchorUnit < 0 ||
        !footnoteTextReference(row, reference)
      ) {
        permanentBad = true;
        return;
      }
      count('mapLookups');
      const lock = locks.get(key);
      if (!lock) {
        locks.set(key, {
          section: row.section,
          paragraph: row.paragraph,
          startUnit: row.startUnit,
          endUnit: row.endUnit,
          ordinal: row.pageOrdinal,
          y: row.y,
          low: reference,
          high: reference,
          seen: -1,
        });
        return;
      }
      if (!sameSource(lock, row) || lock.ordinal !== row.pageOrdinal || lock.y !== row.y)
        permanentBad = true;
      if (reference.anchorUnit < lock.low.anchorUnit) lock.low = reference;
      if (reference.anchorUnit > lock.high.anchorUnit) lock.high = reference;
    },
    beginScan() {
      epoch++;
      scanRevision = revision;
      found = 0;
      bad = false;
      active = true;
      complete = false;
      count('scans');
    },
    observeTextRow(key, row) {
      if (!active) {
        bad = true;
        return;
      }
      if (row?.kind !== 'text') return;
      count('textRowVisits');
      count('mapLookups');
      const lock = locks.get(key);
      if (!lock) return;
      if (lock.seen === epoch) {
        bad = true;
        count('duplicates');
        return;
      }
      lock.seen = epoch;
      found++;
      count('knownRowVisits');
      if (!sameSource(lock, row) || row.pageOrdinal !== lock.ordinal || row.y !== lock.y)
        bad = true;
      count('scanReferenceChecks');
      if (!footnoteTextReference(row, lock.low)) bad = true;
      if (lock.high !== lock.low) {
        count('scanReferenceChecks');
        if (!footnoteTextReference(row, lock.high)) bad = true;
      }
    },
    endScan() {
      complete = active;
      active = false;
    },
    valid() {
      count('finalChecks');
      return (
        complete &&
        !active &&
        !bad &&
        !permanentBad &&
        scanRevision === revision &&
        found === locks.size
      );
    },
  };
}
