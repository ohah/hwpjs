# EMF target color matching

## 구현 계약

- `src/image/emf/color_match_values.zig`가 Microsoft [ColorSpace enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/75da12f8-f437-48e8-8677-4b46e0045969)의 action 1, 2, 3과 [ColorMatchToTarget enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b63c02c1-7644-4ef3-a496-3127621cb7b5)의 embedded 값 0, 1을 검증합니다.
- `src/image/emf/color_match_to_target.zig`가 [EMR_COLORMATCHTOTARGETW](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b9e3e8fa-1d07-4475-b0f2-d157eeca5417)의 24바이트 고정 prefix와 `cbName`, `cbData`를 해석합니다. 전체 record 크기는 정확히 `24 + cbName + cbData`여야 합니다.
- 이름은 `cbName` 바이트의 borrowed UTF-16LE view이며 공통 UTF-16 scalar 검사기를 통과해야 합니다. 명세가 NUL 종단을 요구하지 않으므로 빈 이름, 내부 NUL, 종단 NUL을 원형대로 보존합니다.
- raw target profile은 이름 바로 뒤의 `cbData` 바이트 borrowed view입니다. 이 계층은 ICC 내용이나 action 순서 상태를 검증하지 않습니다.
- framing은 유효 payload를 검사하고 `color_match_records`만 집계합니다. 색 변환 적용과 `CS_DELETE_TRANSFORM`의 선행 ICM 상태 검사는 렌더링/state 계층의 후속 범위입니다.

## 검증 기록

- 빈 payload와 이름·프로필 동시 존재, surrogate pair와 NUL, action/embedded 전체 정의값·미정의값, 모든 입력 잘림, 선언/실제 크기 불일치, `cbName + cbData` 초과, 홀수 UTF-16 바이트, 고립 surrogate, 다른 record dispatch를 검사합니다.
- framing fixture에서 정상 집계와 잘못된 size field의 의미 검증 연결을 확인합니다.
- action/flag 값과 offset, 두 크기 field, UTF-16 검사, payload 분할, exact extent, framing dispatch·집계의 12개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 실행해 36/36 검출했습니다. 첫 실행에서 제품 `fixed_size`를 fixture도 참조해 24→25 변이가 살아남는 테스트 oracle 결합을 재현해 분리했습니다. PIXELFORMAT 검증에서 연속 변이 cache 위험을 확인한 뒤에는 각 변이 직후 `.zig-cache`를 제거하는 강화된 실행으로 36회 전체를 다시 측정했습니다.
- 세 모드 전체 audit는 각각 1,441/1,441 테스트를 통과했습니다. 현재 재귀 HWP corpus 584개에서 signature로 확인된 EMF 후보가 0개이므로 이 record의 실제 HWP 표본 일치까지 주장하지 않으며, wire fixture와 명세 대조가 현재 근거입니다.
