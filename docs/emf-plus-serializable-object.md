# EMF+ SerializableObject와 Image Effects

## 구현 범위와 책임

`src/image/emf/emf_plus_serializable_object.zig`는 [MS-EMFPLUS 2.3.5.2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/bbd49011-1527-46be-8fe6-ccceecfd005f)의 `EmfPlusSerializableObject` envelope를 소유합니다. 16바이트 GUID packet, BufferSize, 정확한 `DataSize = BufferSize + 20`, `Size = BufferSize + 32`, 4바이트 정렬을 검사합니다. Flags는 명세대로 원값을 보존하지만 해석하지 않습니다.

책임은 다음처럼 분리합니다.

- `emf_plus_image_effect_guid.zig`: [11개 공식 ImageEffects GUID](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/18f3cb09-8793-42e1-9337-b24794d4223c)를 GUID packet byte order로 분류합니다. 알 수 없는 GUID를 기본 효과로 대체하지 않습니다.
- `emf_plus_image_effect.zig`: GUID가 선택한 parameter block 한 개의 필드·배열·MUST 범위를 검사합니다. Buffer의 borrowed view를 유지하며 할당하지 않습니다.
- `emf_plus_serializable_object.zig`: envelope와 위 두 계층만 조립합니다. GUID와 payload를 독립적으로 추정하지 않습니다.
- `emf_plus_stream.zig`: 검증된 SerializableObject와 효과별 개수만 집계합니다. Object Table에는 넣지 않습니다.

## 효과별 계약

| 효과 | Buffer | 검사 |
|---|---:|---|
| Blur | 8 | radius 유한 0..255, ExpandEdge 0/1 |
| BrightnessContrast | 8 | brightness -255..255, contrast -100..100 |
| ColorBalance | 12 | CyanRed·MagentaGreen·YellowBlue 각각 -100..100 |
| ColorCurve | 12 | adjustment 0..7, channel 0..3, adjustment별 -255..255·-100..100·0..255 |
| ColorLookupTable | 1024 | Blue·Green·Red·Alpha 순서의 256바이트 배열 네 개 |
| ColorMatrix | 100 | column-major 25개 f32, Matrix_4_0/1/2/3은 0.0 |
| HueSaturationLightness | 12 | hue -180..180, saturation/lightness -100..100 |
| Levels | 12 | highlight/shadow 0..100, midtone -100..100 |
| RedEyeCorrection | 4+16×count | signed count 음수 거부, RectL 배열의 정확한 산술 경계 |
| Sharpen | 8 | radius 유한 0..255, amount 유한 0..100 |
| Tint | 8 | hue -180..180, amount -100..100 |

Sharpen radius의 프로토콜 표는 필드 설명에 범위를 빠뜨렸지만 Microsoft의 [SharpenParams](https://learn.microsoft.com/en-us/windows/desktop/api/Gdipluseffects/ns-gdipluseffects-sharpenparams)는 0..255를 요구합니다. wire object가 해당 parameter structure를 직렬화하므로 같은 범위를 적용했습니다. ColorMatrix의 Matrix_4_4는 SHOULD 1.0이므로 오류로 강제하지 않고 원값을 보존합니다. 그 밖의 Matrix f32도 명세가 MUST 범위를 주지 않으므로 임의 정규화하지 않습니다.

RedEye의 RectL은 이 계층에서 16바이트 원시 배열로 빌립니다. 개수·경계는 검증하지만 좌표 정규화, 사각형 중첩, 이미지 범위와의 관계는 렌더링 계층 책임입니다. 효과 적용·픽셀 생성·DrawImagePoints 연결도 현재 범위가 아닙니다.

## 적대적 검증

공식 문자열 11개를 테스트 상수와 공유하지 않는 canonical GUID 변환기로 packet bytes와 대조해 11/11 일치를 확인했습니다. 모든 효과의 정상 dispatch, 정확/짧음/후행 크기, 각 스칼라 경계, 네 필수 Matrix 0 위치, RedEye 음수·개수 불일치, envelope 정렬·크기·미지 GUID, stream 실패 원자성을 검사합니다.

독립 임시 복사본에는 Buffer 정렬 제거, envelope 후행 허용, 미지 GUID의 Tint 대체, 고정 크기 후행 허용, 공통 범위 조건 약화, Blur NaN 허용, Boolean 2 허용, Curve enum 범위 확대, Matrix 필수 0 하나 누락, RedEye 후행 허용, Sharpen 상한 확대, 직접 Record의 DataSize/Size 검사 제거까지 15개 결함을 각각 주입했습니다. 캐시를 공유하지 않은 Debug·ReleaseSafe·ReleaseFast 45회에서 모두 검출했습니다. 처음 두 실행에서 비교 방향과 동명이 필드 선택이 잘못된 동등·오대상 변이를 확인해 변이 생성 자체를 수정한 뒤 본체 39회를 처음부터 다시 통과했고, 후속 선언 필드 6회도 별도 통과했습니다.

현재 정규 corpus에는 실제 HWP에서 추출한 EMF+ SerializableObject 표본이 없습니다. 합성 wire 검증을 한글 생성기별 효과 렌더링 일치로 확대하지 않습니다.

최종 제품 트리의 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 40/40 단계, 1,519/1,519 테스트를 통과했습니다. 각 모드는 네이티브 1,480개, 차트 소유권 31개, WMF 8개와 HWP/WASM 8,905,827회 검사, WASM imports 0개를 포함합니다. 로그는 `/tmp/hwpjs-emfplus-effects-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 이 수치는 위 실제 표본·효과 적용 공백을 완료로 바꾸지 않습니다.
