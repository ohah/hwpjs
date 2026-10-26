// 원본 조회 실패와 crop 배열의 구조 검사만 공유합니다. 좌표 의미는 별도입니다.
const errorFields = [
  "ownerError",
  "geometryError",
  "positionError",
  "flowError",
  "cropError",
  "transformError",
  "renderingCornersError",
];

export function hasPictureSourceErrors(picture) {
  return (
    !picture ||
    typeof picture !== "object" ||
    Array.isArray(picture) ||
    errorFields.some((field) => picture[field] != null)
  );
}

export function hasFinitePictureCrop(picture) {
  const clip = picture?.crop?.clip;
  return Array.isArray(clip) && clip.length === 4 && Array.from(clip).every(Number.isFinite);
}
