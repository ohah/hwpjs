import { pictureQuadTransform } from "./picture-quad-transform.mjs";
import { paintInlinePicture } from "./picture-inline.mjs";

// 모서리는 자르기 뒤 표시할 사각형의 확정된 변환 결과를 호출자가 제공합니다.
export function paintPictureQuad(ctx, bitmap, picture, corners, origin) {
  const placement = pictureQuadTransform(corners, origin);
  if (placement.state !== "mapped") return false;
  ctx.save();
  try {
    ctx.transform(...placement.matrix);
    // 기존 자르기 계산을 재사용하고 목적 영역은 단위 사각형으로 정규화합니다.
    return paintInlinePicture(ctx, bitmap, { picture, width: 1, height: 1 }, 0, 0);
  } finally {
    ctx.restore();
  }
}
