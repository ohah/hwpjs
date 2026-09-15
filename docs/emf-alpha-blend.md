# EMF alpha blend

## 현재 계약

`src/image/emf/alpha_blend.zig`는 `EMR_ALPHABLEND`(0x72)의 blend 전용 조건을 해석합니다. TRANSPARENTBLT와 공유하는 108바이트 source-transfer 배치는 `bitmap_source_transfer.zig`, 실제 bitmap 범위·간격·정렬·DIB 크기는 기존 `bitmap_source`/`bitmap_object`/`dib_payload` 계층이 각각 한 번만 검사합니다. ALPHABLEND는 목적지와 원본 width/height의 양수 조건 및 per-pixel alpha의 32bpp 조건을 추가합니다.

`src/image/emf/blend_function.zig`가 4바이트 BLENDFUNCTION을 소유합니다. 정의된 `AC_SRC_OVER`(0), constant alpha, AlphaFormat 0과 `AC_SRC_ALPHA`(1)를 구분합니다. BlendFlags는 명세가 0을 지정하면서도 재생 시 무시하도록 요구하므로 거부하지 않고 원값을 보존합니다. per-pixel alpha를 선언하면 Win32 계약에 따라 source DIB가 32bpp인지 검사합니다.

premultiplied RGB 채널 값 자체의 검사와 픽셀 합성·렌더링은 아직 구현하지 않았습니다. 압축/bitfield DIB까지 고려한 채널 마스크 해석 없이 `RGB <= alpha`만 적용하면 오탐할 수 있으므로 구조 파서에서 추정하지 않습니다.

## 검증 기록

- 고정 영역의 모든 필드, constant/per-pixel alpha, 무시되는 nonzero BlendFlags, undefined space와 trailing data를 검사합니다.
- 108바이트 이전의 모든 잘림, bitmap 전체의 각 잘림, record size 불일치, 누락/불완전 source, 0·음수 크기, 미정의 blend operation/alpha format, ColorRef 예약 바이트, DIB usage와 per-pixel alpha bit count 오류를 거부합니다.
- 전체 EMF framing이 payload를 실제 호출하고 개수를 집계하는 fixture를 둡니다.
- 고정 크기, 목적지/원본 양수 조건, blend operation/alpha format, source 필수성, 32bpp, ColorRef 예약값, bitmap semantic end, framing 연결의 10개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 각각 실행했습니다. 최초 검증에서 `cxSrc == 0` 변이가 빠져나가는 테스트 누락을 재현했고 0 경계를 추가한 뒤 30/30 검출을 확인했습니다.
- 실제 HWP corpus에서 EMF 표본이 관측되지 않았으므로 실제 문서 호환 완료를 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.1.1 `EMR_ALPHABLEND Record`
- Microsoft Win32 `BLENDFUNCTION structure`
