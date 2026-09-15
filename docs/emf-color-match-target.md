# EMF target color matching

## 구현 계약

- `src/image/emf/color_match_values.zig`가 Microsoft [ColorSpace enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/75da12f8-f437-48e8-8677-4b46e0045969)의 action 1, 2, 3과 [ColorMatchToTarget enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b63c02c1-7644-4ef3-a496-3127621cb7b5)의 embedded 값 0, 1을 검증합니다.
- `src/image/emf/color_match_to_target.zig`가 [EMR_COLORMATCHTOTARGETW](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b9e3e8fa-1d07-4475-b0f2-d157eeca5417)의 24바이트 고정 prefix와 `cbName`, `cbData`를 해석합니다. `24 + cbName + cbData`는 필수 의미 payload의 끝입니다.
- 이름은 `cbName` 바이트의 borrowed UTF-16LE view이며 공통 UTF-16 scalar 검사기를 통과해야 합니다. 명세가 NUL 종단을 요구하지 않으므로 빈 이름, 내부 NUL, 종단 NUL을 원형대로 보존합니다.
- raw target profile은 이름 바로 뒤의 정확한 `cbData` 바이트 borrowed view입니다. 선언 Size와 실제 slice는 일치해야 하며 의미 payload보다 짧을 수 없습니다. Microsoft [EMF record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)에 따른 나머지 미정의 바이트는 `trailing_data`로 분리합니다. 이 계층은 ICC 내용이나 action 순서 상태를 검증하지 않습니다.
- framing은 유효 payload를 검사하고 `color_match_records`만 집계합니다. 색 변환 적용과 `CS_DELETE_TRANSFORM`의 선행 ICM 상태 검사는 렌더링/state 계층의 후속 범위입니다.

## 검증 기록

- 빈 payload와 이름·프로필 동시 존재, surrogate pair와 NUL, action/embedded 전체 정의값·미정의값, 모든 입력 잘림, 선언/실제 크기 불일치, `cbName + cbData` 초과, 크기 축소에 따른 name/profile/후행 재분할, 홀수 UTF-16 바이트, 고립 surrogate, 다른 record dispatch를 검사합니다.
- framing fixture에서 확장 record 다음 EOF 경계, 정상 집계와 잘못된 size field의 의미 검증 연결을 확인합니다.
- 2026-09-16 공식 상위 규칙과 다시 대조해, 최초 구현의 exact extent와 이를 지지하던 테스트가 잘못됐음을 확인했습니다. 이전 36/36 변이와 1,441개 audit 기록은 잘못된 extent 계약의 완료 근거로 사용하지 않습니다.
- action/flag 정의값과 offset, fixed prefix·dispatch·선언 길이, 두 크기 field의 offset·산식, UTF-16 검사, name/profile 분할·exact-size 회귀·후행 분리, framing 호출·집계의 19개 독립 변이를 각 변이 직전 cache를 제거한 복사본에서 Debug/ReleaseSafe/ReleaseFast로 실행해 57/57 검출했습니다. 제품 `fixed_size`와 독립 test 상수를 계속 분리합니다.
- 교정 후 최종 `audit`는 Debug, ReleaseSafe, ReleaseFast에서 각각 40/40 단계와 1,450/1,450 테스트를 통과했습니다.
- 현재 재귀 HWP corpus 584개에서 signature로 확인된 EMF 후보가 0개이므로 이 record의 실제 HWP 표본 일치까지 주장하지 않으며, wire fixture와 명세 대조가 현재 근거입니다.
