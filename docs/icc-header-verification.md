# ICC 헤더 식별자·수치 계층 검증

## 세 모드 전체 감사

2026-09-07 최종 코드에서 `zig build audit --summary all`, `zig build audit -Doptimize=ReleaseSafe --summary all`, `zig build audit -Doptimize=ReleaseFast --summary all`을 순차 실행했습니다. 세 모드 모두 종료 코드 0, 17/17 단계, 네이티브 420/420 테스트, HWP 검사 4,399,037건을 통과했습니다. 임시 로그는 `/tmp/hwpjs-icc-header-Debug.log`, `/tmp/hwpjs-icc-header-ReleaseSafe.log`, `/tmp/hwpjs-icc-header-ReleaseFast.log`입니다. 최종 Zig 포맷·JS 4개 문법·로컬 링크 13개·diff 검사도 통과했습니다.

완료 범위는 식별자 표와 명시적 수치 검사/진단 계층입니다. 등록부 대조·클래스별 추가 제약·필수 태그·내용·PNG 통합·색상 변환은 여전히 미완료입니다. 테스트 통과나 이 파트의 완료를 전체 ICC/문서 명세 검증 완료로 읽으면 안 됩니다.

후속 [v2 수치·미확정 영역](icc-header-v2-values.md)을 mode 148로 연결했습니다. 입력은 D50 정책 u32 LE(0 nearest_encoding / 1 rounded_four_decimals) + 정확히 128바이트 v2 헤더입니다. 반환은 10개 u32 LE: 내장 여부, 독립 사용 금지, 미정의 ICC 플래그, 공급자 플래그, 미디어 속성, 미정의 ICC 속성, 공급자 속성, 의도 하위 값, 의도 상위 비트, reserved 비영 바이트 수입니다. limit은 옵션 포함 입력 전체입니다. 아래 mode 146/147 최초 실행 기록과 구분합니다.

## v2 추가 후 최신 결과

최종 재검토에서 Debug WASM에 여러 필드를 동시에 변형하는 수동 비교도 실행했습니다. xorshift32 seed `0x72687770`에서 mode 146~148과 각 입력의 1~8개 바이트 변형을 선택한 10,000건이 독립 기준과 일치했습니다(정상 3,096·거부 6,904). 같은 인스턴스의 정상 v4 입력 복구도 확인했습니다. 이 수동 검사는 아래 자동 audit 개수에 합산하지 않습니다.

2026-09-07 `zig build hwp5-audit -Doptimize=ReleaseSafe --summary all` 종료 코드 0, 7/7 단계, HWP 검사 4,399,037건, WASM import 0을 확인했습니다. 헤더 비교 전체는 정상 185,356건·거부 372,611건이며, v2 두 정책의 헤더 전 위치 변형 65,536건을 추가로 포함합니다. 로컬 임시 로그는 `/tmp/hwpjs-icc-v2-values-wasm.log`입니다. 이후 정규 세 모드 전체 audit 결과는 상단에 기록했습니다.

공식 sRGB2014.icc와 added-bytes.icc를 메모리로 다시 읽어 mode 148의 두 정책을 독립 JS 기준과 대조했습니다. 해시는 기존 실파일 기록과 같았습니다. sRGB2014의 보고서는 두 정책 모두 `0,0,0,0,0,0,1,0,0,16`입니다. 공급자 속성값 1과 reserved 비영 바이트 16개를 그대로 보고했습니다. 이를 v4 ID라고 판정하지 않습니다. added-bytes의 보고서는 두 정책 모두 10개 값이 0입니다. 이 수동 결과는 헤더에 한정되며 전체 파일 유효성/색상 일치 인증이나 자동 검사 개수에 합산하지 않습니다.

검사 계약은 [식별자](icc-header-identifiers.md)와 [v4 수치](icc-header-values.md)에 둡니다. 여기서는 이후 WASM 연결과 독립 비교 결과만 관리합니다. 제품 JS API에 HWP/ICC 기능을 추가한 것은 아닙니다.

## 테스트 인터페이스

- mode 146: edition u32 LE(0 v2_2001 / 1 v4_2022) + 정확히 128바이트 헤더. 반환은 4개 u32 LE: 클래스 인덱스(input/display/output/link/color-space/abstract/named-color 순), 데이터 채널 수, PCS 채널 수, 비영 등록부 미검증 필드 수입니다.
- mode 147: 정확히 128바이트 헤더. 반환은 7개 u32 LE: 내장 여부, 독립 사용 금지, 미정의 ICC 플래그, 공급자 플래그, 미디어 속성, 공급자 속성, 렌더링 의도입니다. v4 수치 검사만 호출하므로 식별자나 ID가 유효하다는 뜻은 아닙니다.

두 mode의 limit은 옵션을 포함한 입력 전체 바이트 한도입니다. 헤더의 profile_size와 전체 파일 크기를 비교하지 않습니다. 전체 extent·ID·태그 검사는 기존 별도 API 책임입니다.

독립 JS 기준 `icc-semantics-evidence.mjs`는 클래스·색 공간·플랫폼을 직접 열거하고 Node Buffer/BigInt로 수치를 읽습니다. D50 기대값은 부동소수점 반올림으로 계산해 제품 정수 구현과 구분합니다. 기존 헤더 framing oracle를 `iccWireMajor`로 분리해 이전 extent/ID 검사와 공유합니다.

## 자동 검증 범위

`icc-semantics.mjs`를 정규 HWP5 audit에 연결했습니다. v2/v4 헤더의 모든 위치/바이트 값, 클래스별 PCS, 버전별 플랫폼, 날짜 6개 u16 전 범위, D50 경계, 잘림/초과 길이, 잘못된 정책, 입력 한도, 공급자 비트 동시 설정, 오류 후 정상 처리를 비교합니다. 기준 코드의 예상 assertion 실패만 거부 기대값으로 처리하며 예기치 않은 JS 오류는 테스트 실패로 전파합니다.

mode 146/147 최초 추가 시점의 `zig build hwp5-audit -Doptimize=ReleaseSafe --summary all`은 종료 코드 0, 7/7 단계, 전체 HWP 검사 4,333,029건, WASM import 0으로 통과했습니다. 당시 새 헤더 비교는 정상 135,530건·거부 356,429건이며 식별자 변형 65,536건, 수치 헤더 변형 32,768건, 날짜 393,216건을 포함합니다. 로컬 임시 로그는 `/tmp/hwpjs-icc-semantics-wasm.log`입니다. 이후 v2 추가와 최종 전체 감사 결과는 상단을 참조합니다.

## 실파일 수동 대조

같은 날 [기반 계층 검증에 사용한 공식 ICC 파일 4개](icc-verification.md#공식-외부-파일-비교)를 다시 메모리로 읽어 첫 128바이트를 검사했습니다. 네 파일의 SHA-256은 기존 기록과 같았습니다. 원본 파일이나 외부 구현을 저장소에 추가하지 않았습니다.

| 파일 | mode 146 보고서 | mode 147 보고서 |
|---|---|---|
| sRGB2014.icc | 1, 3, 3, 0 | v2이므로 미검사 |
| sRGB_v4_ICC_preference.icc | 4, 3, 3, 0 | 0, 0, 0, 0, 0, 0, 0 |
| sRGB_v4_ICC_preference_displayclass.icc | 1, 3, 3, 4 | 0, 0, 0, 0, 0, 0, 0 |
| added-bytes.icc | 1, 3, 3, 3 | v2이므로 미검사 |

모든 보고서 바이트가 독립 JS 기준과 일치했습니다. 등록부 미검증 수 4·3도 그대로 반환했습니다. added-bytes의 헤더 성공은 기존 태그 배치 검사의 거부를 상쇄하지 않으며, 전체 파일의 유효성을 의미하지 않습니다. 실제 HWP/PNG 안에서의 연결 검증도 아닙니다. 수동 대조는 자동 검사 개수에 합산하지 않습니다.

변경 JS 4개 문법과 관련 문서의 로컬 링크 9개, Zig 포맷·diff 검사도 확인했습니다.
