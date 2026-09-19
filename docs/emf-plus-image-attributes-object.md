# EMF+ ImageAttributes 객체

## 범위와 단일 출처

- `emf_plus_wrap_mode.zig`는 Brush와 ImageAttributes가 공유하는 WrapMode 0~4의 단일 출처입니다.
- `emf_plus_image_attributes_values.zig`는 signed ObjectClamp의 Rectangle 0과 Bitmap 1만 승인합니다.
- `emf_plus_image_attributes.zig`는 정확히 24바이트인 Version, 두 Reserved, WrapMode, ClampColor와 ObjectClamp를 조립하고 완성 Object의 타입을 확인합니다.
- GraphicsVersion과 ARGB는 기존 공통 parser를 재사용하며 필드 배치를 복제하지 않습니다.

기준은 Microsoft [MS-EMFPLUS] 2.1.1.33, 2.1.1.5, 2.2.1.5입니다. 참고 Rust 구현의 ObjectClamp 원시 `i32` 보존보다 공식 MUST 조건을 우선하여 0과 1 이외의 값을 거부합니다.

## 표현과 검증

ImageAttributes는 입력 24바이트를 빌리고 할당하지 않습니다. 짧은 입력은 `UnexpectedEnd`, 1바이트라도 긴 입력은 `InvalidEmfPlusImageAttributesSize`로 거부하므로 객체 경계의 후행 데이터를 묵인하지 않습니다. GraphicsVersion은 공통 signature를 검사하면서 vendor version 12비트를 보존합니다.

Reserved1은 MUST be ignored, Reserved2는 SHOULD be zero이고 MUST be ignored이므로 둘 다 어떤 u32도 승인하고 원값을 보존합니다. ClampColor는 WrapMode가 Clamp일 때 사용되지만 wire 필드는 모든 모드에 존재하므로 다른 WrapMode에서도 버리거나 0으로 정규화하지 않습니다. 색상 채널은 공통 ARGB의 Blue, Green, Red, Alpha 배치를 따릅니다. 이 계층은 WrapMode sampling이나 색 변환을 수행하지 않습니다.

## 검증 기록

합성 fixture는 고유한 여섯 필드 값, vendor Version, 비zero Reserved 둘, ARGB 원값과 채널, 모든 5개 WrapMode와 2개 ObjectClamp 조합, Clamp 이외 모드의 ClampColor 보존, 0~23바이트 모든 잘림, 25바이트 후행, enum 범위 밖, signature와 ObjectType을 검사합니다. 공용 WrapMode를 분리한 뒤 LinearGradient, PathGradient, Texture Brush 회귀도 함께 실행했습니다.

독립 복사본에는 WrapMode 5 수용, ObjectClamp 2 수용, 25번째 바이트 수용, Version 및 각 필드 손실, 원본 bytes view 손실, ClampColor의 WrapMode 조건부 제거, 잘못된 ObjectType 수용, LinearGradient의 공용 WrapMode 우회를 포함한 13개 유효 의미 결함을 주입했습니다. 각 실행은 새로운 local/global Zig cache를 사용했고 Debug·ReleaseSafe·ReleaseFast의 39/39회에서 테스트가 검출했습니다. 최초 WrapMode 변이는 enum에 존재하지 않는 5를 직접 만들며 safety panic을 일으켜 결과에서 제외하고, 5를 기존 값으로 잘못 보정하는 유효 결함으로 교체해 세 모드에서 다시 검출했습니다. 복사본은 `/tmp/hwpjs-emfplus-image-attributes-mutants.t1MOOr`, 로그는 `/tmp/hwpjs-image-attributes-mutation-<변이>-<모드>.log`와 교체 변이의 `wrap_accept_5-valid` 로그에 남겼습니다.

실제 EMF+ ImageAttributes corpus와 한컴 버전별 사용 방식은 아직 관측하지 않았습니다. 따라서 이 결과는 공식 wire 구조와 합성·변이 회귀 범위이며 이미지 색 보정, 렌더링, Object Table 적용 또는 재직렬화 완료를 뜻하지 않습니다.

최종 제품 트리의 전체 `audit`를 공유 산출물이 겹치지 않도록 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast 모두 40/40 단계와 1,631/1,631 테스트(네이티브 1,592, 차트 31, WMF 8), HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-image-attributes-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
