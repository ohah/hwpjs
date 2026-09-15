# EMF linked universal font IDs

## 현재 계약

`src/image/emf/universal_font_id.zig`는 8바이트 `UniversalFontId`의 Checksum과 Index를 원본 u32로 해석합니다. checksum 0, 1, 2와 3 이상은 명세상 서로 다른 의미를 가지지만 모두 유효하며, 외부 font stream checksum 계산이나 실제 font lookup은 수행하지 않습니다.

`src/image/emf/linked_ufis.zig`는 `EMR_SETLINKEDUFIS`(0x77)의 count, borrowed UFI 배열과 마지막 8바이트 Reserved를 소유합니다. 크기는 `20 + count × 8`과 정확히 일치해야 합니다. count 0은 20바이트 빈 배열로 유지합니다. Reserved는 명세가 MUST be ignored로 지정하므로 0을 강제하지 않고 원본 8바이트를 보존합니다.

`item(index)`는 별도 할당 없이 범위를 검사하고 공통 UniversalFontId parser를 호출합니다. 전체 EMF framing은 각 record와 UFI 총수를 집계하지만 글꼴 fallback·문자 lookup·DC 상태 적용은 아직 구현하지 않았습니다.

## 검증 기록

- checksum 경계 0, 1, 2, 3, u32 최대값과 index byte order를 검사합니다.
- count 0/2, nonzero Reserved 보존, item 경계, 모든 고정 prefix·동적 배열 잘림, count 과소·과대·u32 최대값, 선언/실제 크기 불일치, unrelated type을 검사합니다.
- UFI 크기·두 field offset, record dispatch, count offset·크기 산식, Reserved 위치·무시 정책, item count·stride, framing 호출·총수 집계의 12개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 실행했습니다. 최초 검증에서 populated Reserved 위치와 `count`보다 긴 forged view의 item 경계가 빠진 두 테스트 누락을 재현해 보강했고, 이후 36/36 검출을 확인했습니다.
- 기존 HWP corpus에는 EMF 표본이 관측되지 않았으므로 실제 문서 font lookup 호환 완료를 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.2.27 `UniversalFontId Object`
- Microsoft MS-EMF 2.3.11.18 `EMR_SETLINKEDUFIS Record`
