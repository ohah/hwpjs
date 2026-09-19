# EMF+ Font 객체

## 범위와 단일 출처

- `emf_plus_unit_type.zig`는 Font와 Pen이 공유하는 UnitType 7개 값의 단일 출처입니다.
- `emf_plus_font_values.zig`는 signed FontStyleFlags의 네 비트와 예약 비트 검사를 소유합니다.
- `emf_plus_font.zig`는 Version, EmSize, SizeUnit, style, ignored Reserved, Length 기반 FamilyName과 객체 정렬 바이트를 조립합니다.
- float 원비트, GraphicsVersion, UTF-16 scalar 검사와 Object type은 기존 공통 계층을 재사용합니다.

기준은 Microsoft [MS-EMFPLUS] 2.1.1.32, 2.1.2.4와 2.2.1.3입니다. 기존 Pen 전용 값 파일에 있던 UnitType은 중복 정의 없이 공통 모듈로 이동했고 PenData도 같은 parser를 사용합니다.

## 표현과 검증

Font는 입력을 빌리고 할당하지 않습니다. Length는 UTF-16 코드 유닛 수로 해석하여 `Length × 2`를 checked 산술로 계산하고, 공통 UTF-16LE scalar 검사로 정상 surrogate pair만 허용합니다. 원본 이름 바이트와 scalar/NUL/BOM 통계를 보존하며 문자열 정규화·대소문자 변환·설치된 글꼴 조회를 하지 않습니다.

FontStyleFlags는 명세의 Bold, Italic, Underline, Strikeout 네 비트만 허용합니다. UnitType은 World부터 Millimeter까지 0~6을 허용합니다. 명세 각주가 Windows에서 Display를 사용하지 않는다고 관측하지만 wire enum 지원을 금지하는 규칙은 아니므로 임의로 거부하지 않습니다. EmSize는 IEEE 754 원비트를 유지하며 양수·유한성 같은 렌더링 정책을 추가하지 않습니다. Reserved는 MUST be ignored 규칙에 따라 어떤 u32도 허용하면서 원값을 보존합니다.

단일 Object 레코드는 semantic Font 뒤에 32-bit 정렬 바이트를 포함할 수 있고 multipart assembler 결과는 이를 제외할 수 있습니다. 따라서 패딩이 없거나 semantic 길이를 4바이트 경계로 맞추는 정확한 폭인 경우만 `alignment_padding`으로 보존합니다. 이름 길이로 필요한 폭을 계산할 수 있으므로 임의의 1~3바이트를 허용하지 않습니다. 기본 한도는 전체 64 MiB와 이름 1,000,000 UTF-16 코드 유닛입니다.

## 검증 기록

단위 테스트는 모든 UnitType, 네 style flag와 예약 비트, 고유한 고정 필드 값, ignored Reserved, 빈/ASCII/보충문자 이름, 고립 surrogate, Length와 scalar 수 차이, 모든 잘림, exact 한도, 무패딩/정확한 정렬 폭과 과소·과다 padding, Object type을 검사합니다.

2026-09-19 적대적 검토에서 처음에는 최대 3바이트의 임의 padding을 허용했으나 Font는 이름 길이로 semantic 끝을 정확히 알 수 있어 과수용임을 재현했습니다. 무패딩 또는 정확한 32-bit 정렬 폭만 허용하도록 수정하고 홀수·짝수 Length의 과소·과다 padding을 검증했습니다. UnitType을 Pen 전용 파일에서 공통 모듈로 옮긴 뒤 Font·Pen·UnitType 필터를 함께 실행해 기존 PenData 연결도 확인했습니다.

독립 복사본에서 UnitType domain, style 예약 비트, Version·EmSize·SizeUnit·style·Reserved 필드, 이름 길이 배수·한도·시작 위치·반환 Length, UTF-16 검사·endianness, padding 시작 위치·임의 폭 허용·필요 폭 오산·검사 제거, 잘못된 Reserved 검증, Object type과 전체 크기 한도를 망가뜨린 20개 유효 의미 변이를 실행했습니다. Debug·ReleaseSafe·ReleaseFast의 60회 모두 테스트가 검출했고 컴파일 실패·생존·누락은 각각 0회였습니다. 복사본은 `/tmp/hwpjs-emfplus-font-mutants.ahXwmu`, 로그는 `/tmp/hwpjs-font-mutation-<변이>-<모드>.log`이며 각 실행은 별도의 새 cache/global-cache 경로를 사용했습니다.

정확한 padding 정책으로 수정한 뒤 전체 audit를 세 모드에서 다시 순차 실행했습니다. 각 모드는 40/40 단계와 1,625/1,625 테스트(네이티브 1,586, 차트 31, WMF 8), HWP 감사 8,905,827 checks와 import 오류 0으로 통과했습니다. 최종 로그는 `/tmp/hwpjs-emfplus-font-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 수치는 Font wire parser와 전체 회귀 범위이며 설치 글꼴 조회, glyph shaping 또는 실제 EMF+ Font corpus 관측을 의미하지 않습니다.
