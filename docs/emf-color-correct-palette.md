# EMF palette color correction

## 범위

`src/image/emf/color_correct_palette.zig`는 MS-EMF의 `EMR_COLORCORRECTPALETTE` 레코드를 구조적으로 읽습니다. 고정 필드인 팔레트 핸들, 첫 항목, 항목 수와 예약 필드를 원값으로 보존하고, 공통 EMF 호환성 규칙에 따라 24바이트 필수 prefix 뒤의 확장 데이터도 `trailing_data`로 보존합니다.

`src/image/emf/object_table.zig`는 구조 파싱과 분리해 다음 의미 제약을 검증합니다.

- 핸들이 현재 살아 있는 논리 팔레트를 가리켜야 합니다.
- `first_entry + entry_count`가 현재 팔레트 항목 수를 넘지 않아야 합니다.
- 덧셈은 확장 정수에서 검사해 wraparound를 허용하지 않습니다.
- 빈 범위는 `first_entry`가 팔레트 끝과 같을 때까지 허용합니다.

범위 검사는 `EMR_SETPALETTEENTRIES`와 같은 helper를 사용하므로 경계 정의의 단일 출처는 Object Table에 있습니다. `framing.validate`는 구조 레코드 수와 의미상 처리된 correction 수를 각각 보고합니다.

## 명세 근거와 경계

- [MS-EMF 2.3.8.1 EMR_COLORCORRECTPALETTE Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/99de1bfb-3d77-455b-8679-7386903e1472)
- [MS-EMF 2.3 Records 공통 크기·후행 데이터 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)

예약 필드는 명세대로 해석하거나 0으로 강제하지 않습니다. 이 단계는 wire 구조와 Object Table 참조 무결성까지만 담당하며, Windows Color System을 이용한 실제 색 보정이나 EMF 렌더링은 구현 범위가 아닙니다.

## 검증

- 필드별 little-endian 디코딩, 모든 0~23바이트 절단, 선언 크기 불일치, 다른 record type dispatch를 독립 단위 테스트합니다.
- 24바이트를 넘는 레코드는 확장 데이터를 보존하는지 확인합니다.
- 살아 있는 팔레트, 잘못된 객체 종류, 죽은·0·stock 핸들, 끝 경계의 빈 범위, 범위 초과와 최대 정수 입력을 Object Table에서 검증합니다.
- HEADER, CREATEPALETTE, 확장 COLORCORRECTPALETTE, EOF로 구성한 완전한 EMF에서 framing과 Object Table 계수를 함께 확인합니다.
- 14개 독립 결함 주입(42개 최적화 모드 실행)으로 dispatch, 최소 크기, 네 필드 offset, endian, 후행 데이터, 의미 핸들·범위·끝 경계, 의미 계수와 framing 계수가 모두 테스트에 의해 탐지되는지 확인했습니다.
- 전체 `audit`는 Debug, ReleaseSafe, ReleaseFast에서 각각 40/40 step과 1454/1454 test가 통과했습니다. 이 중 native Zig test는 1415개입니다.

프로젝트의 HWP 표본 코퍼스에서는 이 레코드가 발견되지 않았으므로 실제 표본 동등성 주장은 하지 않습니다. 합성 표본은 공식 wire 계약과 상위 framing을 함께 검증하기 위한 것입니다.
