# EMF color adjustment

## 범위와 책임

`src/image/emf/color_adjustment_values.zig`는 ColorAdjustment flags와 Illuminant 열거값을, `color_adjustment.zig`는 24바이트 객체를, `set_color_adjustment.zig`는 `EMR_SETCOLORADJUSTMENT` record wrapper를 소유합니다. 값 도메인·객체 배치·record framing을 한 파일에 중복하지 않습니다.

ColorAdjustment 객체는 다음 값을 원래 signed/unsigned 폭으로 보존합니다.

- `Size`, `Values`, `IlluminantIndex`
- red/green/blue gamma
- black/white reference
- contrast, brightness, colorfulness, red-green tint

`Size`는 공식 값 24여야 합니다. `Values`는 0 또는 `CA_NEGATIVE`와 `CA_LOG_FILTER`의 조합만 허용하며, illuminant는 공식 0~8 값을 정확히 구분합니다. Gamma, reference 및 signed adjustment의 명세 범위는 `SHOULD`이므로 범위 밖 원값을 파서 오류로 바꾸지 않습니다.

record의 필수 prefix는 32바이트입니다. MS-EMF 공통 호환성 규칙에 따라 그 뒤의 생산자 확장은 `trailing_data`로 보존합니다. `framing.validate`는 구조가 확인된 record 수를 `color_adjustment_records`에 보고합니다.

## 명세 근거

- [MS-EMF 2.3.11.13 EMR_SETCOLORADJUSTMENT Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/81b3cd7c-ed67-42aa-ab98-47b99d697231)
- [MS-EMF 2.2.2 ColorAdjustment Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/71d7f4d0-b645-4de8-a558-8a2e0fc596cb)
- [MS-EMF 2.1.5 ColorAdjustment Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c80a94d5-415d-4c4c-83b8-12c0eb98b81f)
- [MS-EMF 2.1.19 Illuminant Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/7cd7679e-4a14-45d1-9cac-bf7f80be2c10)
- [MS-EMF 2.3 record 공통 크기·후행 데이터 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)

## 검증

- 모든 flag 조합과 illuminant 값, 잘못된 비트와 열거값을 검사합니다.
- 24바이트 객체의 모든 잘림 prefix, 잘못된 내부 Size, 9개 수치 필드의 signed/unsigned 원값과 권고 범위 밖 값을 검사합니다.
- 32바이트 record의 모든 잘림 prefix, 선언 크기 불일치, 다른 record type dispatch와 후행 확장 보존을 검사합니다.
- HEADER, 확장 SETCOLORADJUSTMENT, EOF로 구성한 완전한 EMF를 상위 framing에서 검사하고 손상된 Size/flags/illuminant가 같은 오류로 전파되는지 확인합니다.
- 24개 독립 결함 주입을 Debug, ReleaseSafe, ReleaseFast에서 실행한 72/72회가 모두 테스트에 탐지됐습니다. 각 변이는 필요한 소스만 복제하고 대상 파일 하나만 바꿨습니다. 첫 검토 뒤 `Values`·`IlluminantIndex` offset과 wrapper의 객체 slice 변이를 추가해 필드 위치 편향을 다시 확인했습니다.

최종 Debug, ReleaseSafe, ReleaseFast `audit`는 각각 40/40 step과 1460/1460 test가 통과했습니다. 이 중 native Zig test는 1421개입니다. 584개 HWP corpus의 2,167개 BinData 중 확장자가 WMF인 항목은 66개였지만 EMF signature 후보는 0개였으므로, 이번 record의 실제 HWP 표본 동등성은 주장하지 않습니다.

## 미구현 경계

현재 구현은 wire 구조 검증과 원값 보존까지입니다. playback device context에 값을 적용하거나 SaveDC/RestoreDC 상태로 복원하는 동작, halftone bitmap transfer의 실제 색 조정, 색 변환과 렌더링은 구현하지 않았습니다. 구조 파싱 성공을 시각적 출력 지원으로 해석하지 않습니다.
