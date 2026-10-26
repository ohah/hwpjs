// 초기화 전에 선택된 파일과 이후 사용자 변경을 같은 경로로 처리합니다.
export function bindFileInput(input, onChange) {
  const change = (event) => {
    const selected = input.files?.[0];
    try {
      return onChange(event);
    } finally {
      // The loader has captured the File; permit the same path next time.
      if (selected && input.files?.[0] === selected) input.value = '';
    }
  };
  input.addEventListener('change', change);
  if (input.files?.length) change();
}
