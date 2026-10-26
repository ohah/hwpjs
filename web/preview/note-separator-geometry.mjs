import { compoundLineWeights, compoundLineGap } from "./compound-line-weights.mjs";
// 원본 구분선의 표시 기하만 계산합니다. 긴 선은 지정한 영역 폭에서 자릅니다.
export function noteSeparatorGeometry(policy, width) {
  const unavailable = (error) => ({ state: "unavailable", error });
  const source = policy?.separator;
  if (policy?.state !== "selected" || !source || !Number.isFinite(width) || width <= 0)
    return unavailable("InvalidNoteSeparator");
  if (source.type === "NONE" || source.length === 0)
    return { state: "selected", height: 0, width: 0, color: null };
  const weights = ["DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM"].includes(
    source.type,
  )
    ? compoundLineWeights(source.type)
    : null;
  if (
    (source.type !== "SOLID" && !weights) ||
    typeof source.width !== "string" ||
    !/^\d+(?:\.\d+)? mm$/.test(source.width.trim()) ||
    typeof source.color !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(source.color)
  )
    return unavailable("UnsupportedNoteSeparator");
  const height = (Number.parseFloat(source.width) * 96) / 25.4;
  const length = source.length === "full" ? width : source.length;
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(length) || length < 0)
    return unavailable("InvalidNoteSeparator");
  const result = { state: "selected", height, width: Math.min(width, length), color: source.color };
  if (weights) {
    const scale =
      height /
      (weights.reduce((sum, value) => sum + value, 0) + compoundLineGap * (weights.length - 1));
    let y = 0;
    result.bands = weights.map((weight) => {
      const band = { y, height: weight * scale };
      y += (weight + compoundLineGap) * scale;
      return band;
    });
  }
  return result;
}
