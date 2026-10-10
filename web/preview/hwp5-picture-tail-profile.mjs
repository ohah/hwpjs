// 버전별 선택 배치와 그 배치의 alpha 부재 계약만 소유합니다.
export function hwp5PictureTailLayout(version) {
  return version === 0x05010001 ? "with_alpha9" : version === 0x05000500 ? "dimensions8" : null;
}
export function hwp5PictureTailAlphaSupported(tail) {
  // 명시적0 alpha의 기존 판정은 유지하고 부재 허용만 버전 프로필로 제한합니다.
  if (tail?.image_alpha === 0) return true;
  const layout = hwp5PictureTailLayout(tail?.fileVersion);
  if (layout === null || tail.layout !== layout) return false;
  return layout === "dimensions8" && tail.image_alpha === null;
}
