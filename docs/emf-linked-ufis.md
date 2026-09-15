# EMF linked universal font IDs

## 현재 계약

`src/image/emf/universal_font_id.zig`는 8바이트 `UniversalFontId`의 Checksum과 Index를 원본 u32로 해석합니다. checksum 0, 1, 2와 3 이상은 명세상 서로 다른 의미를 가지지만 모두 유효하며, 외부 font stream checksum 계산이나 실제 font lookup은 수행하지 않습니다.

`src/image/emf/linked_ufis.zig`는 Microsoft [EMR_SETLINKEDUFIS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3bb62157-624f-443f-a88c-ef5e696740dd)(0x77)의 count, borrowed UFI 배열과 그 뒤 8바이트 Reserved를 소유합니다. `20 + count × 8`은 필수 의미 prefix의 끝이며, count 0은 20바이트 빈 배열로 유지합니다. Reserved는 명세가 MUST be ignored로 지정하므로 0을 강제하지 않고 원본 8바이트를 보존합니다.

선언 Size와 실제 slice는 일치해야 하며 필수 의미 prefix보다 짧을 수 없습니다. Microsoft [EMF record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)에 따라 그 뒤의 미정의 extra data는 `trailing_data`로 분리합니다. 선언 일치와 최소 prefix 판정은 `record_extent.zig`를 재사용합니다.

`item(index)`는 별도 할당 없이 범위를 검사하고 공통 UniversalFontId parser를 호출합니다. 전체 EMF framing은 각 record와 UFI 총수를 집계하지만 글꼴 fallback·문자 lookup·DC 상태 적용은 아직 구현하지 않았습니다.

## 검증 기록

- checksum 경계 0, 1, 2, 3, u32 최대값과 index byte order를 검사합니다.
- count 0/2, nonzero Reserved 보존, item 경계, 모든 고정 prefix·동적 배열 잘림, count 과대·u32 최대값, 선언/실제 크기 불일치, count 축소 시 Reserved 재배치와 후행 분리, unrelated type을 검사합니다.
- 2026-09-16 공식 상위 규칙과 다시 대조해, 최초 구현의 count-derived exact-size 제한과 count 축소 거부 테스트가 잘못됐음을 확인했습니다. 이전 36/36 변이 기록은 잘못된 extent 계약의 완료 근거로 사용하지 않습니다.
- UFI 크기·두 field offset, record dispatch, 선언 길이, count offset·endianness·필수 크기 산식·exact-size 회귀·후행 분리, 배열·Reserved 위치, item count·stride, framing 호출·record/총수 집계의 17개 독립 변이를 각 변이 직전 cache를 제거한 복사본에서 Debug/ReleaseSafe/ReleaseFast로 실행해 51/51 검출했습니다.
- 교정 후 최종 `audit`는 Debug, ReleaseSafe, ReleaseFast에서 각각 40/40 단계와 1,450/1,450 테스트를 통과했습니다.
- 기존 HWP corpus에는 EMF 표본이 관측되지 않았으므로 실제 문서 font lookup 호환 완료를 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.2.27 `UniversalFontId Object`
- Microsoft MS-EMF 2.3.11.18 `EMR_SETLINKEDUFIS Record`
- Microsoft MS-EMF 2.3 `EMF Records`
