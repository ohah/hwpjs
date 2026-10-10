// 초기화 전에 선택된 파일과 이후 사용자 변경을 같은 경로로 처리합니다.
export function bindFileInput(input, onChange) {
  input.addEventListener("change", onChange);
  if (input.files?.length) onChange();
}
