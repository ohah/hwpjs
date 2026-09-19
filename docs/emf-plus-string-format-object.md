# EMF+ StringFormat 객체

## 범위와 단일 출처

- `emf_plus_string_values.zig`는 StringAlignment, StringDigitSubstitution, StringTrimming, HotkeyPrefix, StringFormat flags와 LanguageIdentifier 원값 분해를 소유합니다.
- `emf_plus_character_range.zig`는 signed First/Length 쌍과 빌린 배열 view를 소유합니다.
- `emf_plus_string_format_data.zig`는 signed count, TabStops/CharRange 크기 산술과 두 배열 경계를 소유합니다.
- `emf_plus_string_format.zig`는 60바이트 고정 헤더, 가변부 연결, 전체 크기와 Object type을 소유합니다.
- float 원비트 읽기는 `emf_plus_values.zig`, GraphicsVersion과 Object 조립은 기존 공통 계층을 재사용합니다.

기준은 Microsoft [MS-EMFPLUS] 2.1.1.14, 2.1.1.28~30, 2.1.2.8, 2.2.1.9, 2.2.2.8, 2.2.2.23, 2.2.2.44입니다.

## 표현과 검증

StringFormat은 입력을 빌리고 할당하지 않습니다. 고정 헤더 뒤의 데이터 길이는 정확히 `TabStopCount × 4 + RangeCount × 8`이어야 합니다. 두 count는 wire에서 i32이므로 음수와 설정 한도를 넘는 값을 거부하며, 곱셈·덧셈 overflow를 검사합니다. 기본 한도는 전체 64 MiB, tab stop과 character range 각각 1,000,000개입니다.

StringFormat flags는 명세가 정의한 `0x80007c27` 비트만 허용합니다. 세 enum과 signed HotkeyPrefix는 정의된 값만 허용합니다. LanguageIdentifier는 LCID 전체 u32를 보존하고 명세가 정의한 low 10-bit primary language와 다음 6-bit sublanguage 접근자를 제공합니다. 알려진 LCID 목록이나 high bits를 임의로 제한하지 않습니다.

Tab stop float는 IEEE 754 원비트를 보존합니다. CharacterRange의 First와 Length는 명세대로 signed i32 원값을 보존하며, 렌더링 대상 문자열이 없으므로 음수·겹침·범위 초과를 이 객체 파서에서 추정해 거부하지 않습니다. 후속 DrawString/MeasureCharacterRanges 조립 계층이 대상 문자열과의 의미 관계를 검사해야 합니다.

## 검증 기록

단위 테스트는 모든 enum domain과 sparse flag, LCID 분해, signed CharacterRange, 고정 필드 순서, 빈/채워진 두 배열, exact 한도, 모든 바이트 잘림, 음수 count, 후행 바이트와 Object type을 검사합니다.

2026-09-19 적대적 검토에서 상위 StringFormat 경로가 첫 CharacterRange만 검사해 8바이트 stride 변이를 놓치는 위치 편향을 재현했습니다. 두 번째 range를 서로 다른 값으로 읽는 테스트를 추가한 뒤 같은 변이를 세 모드에서 다시 검출했습니다. 고정 헤더의 Language/DigitLanguage, 두 alignment, 네 float, HotkeyPrefix, Trimming도 서로 다른 값으로 모두 대조하고 빈 가변부의 정확한 60바이트 경계를 보강했습니다.

독립 복사본에서 enum domain, Hotkey 값, sparse flag mask, LCID 두 bit field, 두 signed count, 두 count 한도, tab/range stride와 합산 길이, 길이 off-by-one, 후행 data, CharacterRange view stride, line alignment·tracking 필드 연결, Object type과 전체 크기 한도를 망가뜨린 21개 유효 의미 변이를 실행했습니다. Debug·ReleaseSafe·ReleaseFast의 63회 모두 테스트가 검출했고 컴파일 실패·생존·누락은 각각 0회였습니다. 선언되지 않은 enum tag나 음수 unsafe cast를 유발한 초기 변이는 유효 결과에서 제외하고 명시적 잘못된 값 수용 변이로 교체했습니다. 복사본은 `/tmp/hwpjs-emfplus-string-format-mutants.UoZZFp`, 최종 로그는 `/tmp/hwpjs-string-format-mutation-<변이>-<모드>.log`입니다. 각 실행은 별도의 새 cache/global-cache 경로를 사용했습니다.

같은 날 전체 audit를 세 모드에서 순차 실행했습니다. 각 모드는 40/40 단계와 1,618/1,618 테스트(네이티브 1,579, 차트 31, WMF 8), HWP 감사 8,905,827 checks와 import 오류 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-string-format-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 수치는 현재 회귀 범위이며 StringFormat 렌더링이나 실제 EMF+ StringFormat corpus 관측을 의미하지 않습니다.
