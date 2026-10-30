import { paginateFootnoteContinuationUnits } from './footnote-continuation-engine.mjs';

// 긴 plain 각주의 전체 행을 한 번씩 소비합니다. 측정/번호/표시 authority는 기존 모듈입니다.
export function paginatePlainFootnoteContinuations(
  rows,
  setting,
  flows,
  notes,
  policy,
  separatorHeight,
  options = {},
) {
  return paginateFootnoteContinuationUnits(
    rows,
    setting,
    flows,
    notes,
    policy,
    separatorHeight,
    options,
    false,
  );
}

// 측정기가 새로 만든 note의 잠금 좌표만 값으로 소유합니다. raw 진입점은 기존 재검사를 유지합니다.
export function paginateMeasuredPlainFootnoteContinuations(
  rows,
  setting,
  flows,
  notes,
  policy,
  separatorHeight,
  options = {},
) {
  return paginateFootnoteContinuationUnits(
    rows,
    setting,
    flows,
    notes,
    policy,
    separatorHeight,
    options,
    true,
  );
}
