/** Display text only; never reclassifies an error or grants edit authority. */
export function failureMessage(error) {
  try {
    if (typeof error === "string" && error.length) return error;
    const message = error?.message;
    if (typeof message === "string" && message.length) return message;
  } catch { /* 오류 메시지 접근도 실패할 수 있습니다. */ }
  return "알 수 없는 오류";
}
