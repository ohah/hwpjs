// 원본 signed-or-unsigned 32비트 값을 표시용 부호 있는 정수로 해석합니다.
export const signedInt32 = (value) =>
  Number.isInteger(value) && value >= -2147483648 && value <= 4294967295
    ? value > 2147483647
      ? value - 4294967296
      : value
    : null;
