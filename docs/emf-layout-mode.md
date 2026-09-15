# EMF layout mode

## 현재 계약

`src/image/emf/layout_mode.zig`는 Microsoft [EMR_SETLAYOUT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/dcb69f9d-6f69-466a-af1e-6f505d86cc67)(0x73)의 12바이트 필수 prefix와 LayoutMode DWORD를 해석합니다. `LAYOUT_LTR`은 두 비트가 모두 꺼진 기본값이며, `LAYOUT_RTL`(0x1)과 `LAYOUT_BITMAPORIENTATIONPRESERVED`(0x8)를 독립 bool과 raw 값으로 보존합니다. 정의된 조합은 0, 1, 8, 9입니다.

선언 Size와 실제 slice가 일치해야 하며 12바이트보다 짧을 수 없습니다. Microsoft [EMF record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)에 따라 명세되지 않은 끝의 extra data는 `trailing_data`로 분리하고 LayoutMode에 섞지 않습니다. 이 extent 판정은 `record_extent.zig`를 재사용합니다. 두 정의 비트 이외의 비트는 거부합니다.

전체 EMF framing은 이 parser를 호출해 잘못된 layout을 문서 수준에서 거부합니다. 실제 playback DC의 좌우 반전, 텍스트 정렬 flag 재해석, bitmap mirroring은 렌더러 범위로 아직 구현하지 않았습니다.

## 검증 기록

- 네 유효 조합, 각 bool과 raw 보존을 검사합니다.
- 30개 미정의 단일 비트와 전체 비트 composite, 필수 prefix 잘림, 확장 record의 후행 분리와 다음 EOF 경계, 선언/실제 길이 불일치, unrelated type을 검사합니다.
- 2026-09-16 공식 상위 규칙과 다시 대조해, 최초 구현의 정확 12바이트 제한과 이를 지지하던 문서·테스트가 잘못됐음을 확인했습니다. 이전 30/30 변이 기록은 잘못된 extent 계약의 완료 근거로 사용하지 않습니다.
- dispatch, 필수 prefix·선언 일치·exact-size 회귀·후행 분리, DWORD offset·endianness, 비트 마스크 누락·과허용, 두 bool 매핑, raw 보존, framing 연결의 13개 독립 변이를 각 변이 직전 cache를 제거한 복사본에서 Debug/ReleaseSafe/ReleaseFast로 실행해 39/39 검출했습니다. 최초 과허용 변이가 제품 `defined_flags`를 oracle로 재사용한 테스트를 빠져나간 과거 문제와 달리, 공식 리터럴 기반 독립 oracle을 유지합니다.
- Win32 `SetLayout`도 인자를 두 값 중 하나 이상으로 정의하므로 두 비트를 합친 0x9를 유효하게 유지합니다. 교정 후 최종 `audit`는 Debug, ReleaseSafe, ReleaseFast에서 각각 40/40 단계와 1,450/1,450 테스트를 통과했습니다.
- 기존 HWP corpus에는 EMF 표본이 관측되지 않았으므로 실제 문서 playback 호환 완료를 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.11.17 `EMR_SETLAYOUT Record`
- Microsoft MS-EMF 2.3 `EMF Records`
- Microsoft Win32 `SetLayout function`
