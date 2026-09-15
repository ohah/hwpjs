# EMF transparent bitmap transfer

## 현재 계약

`src/image/emf/transparent_blt.zig`는 `EMR_TRANSPARENTBLT`(0x74)의 색상 키와 레코드 종류별 오류를 소유합니다. `src/image/emf/bitmap_source_transfer.zig`는 ALPHABLEND와 공유하는 108바이트 배치, source bitmap 필수성, bounds·좌표·XForm·배경색·DIB usage·offset/size의 단일 해석을 소유합니다. 실제 DIB 범위·간격·정렬·payload 검증은 기존 bitmap SSOT를 재사용합니다.

명세는 목적지와 원본 width/height를 signed integer로 정의하지만 ALPHABLEND와 달리 양수 MUST 조건을 두지 않습니다. 따라서 0·음수를 포함한 원값을 보존합니다. Microsoft의 TransparentBlt API도 음수 크기는 미러링하지 않는다고 설명하지만, 이 구조 파서는 API 실행 결과를 추정하지 않습니다.

TransparentColor와 BkColorSrc는 ColorRef로 해석하고 예약 바이트를 검사합니다. 모든 유효한 DIB 형식을 구조적으로 허용하며 32bpp도 별도 fixture로 고정합니다. 32bpp 입력의 alpha 복사 동작, 색상 키 적용, stretching과 렌더링은 아직 구현하지 않았습니다.

## 검증 기록

- 공통 고정 필드, signed 크기 0·음수, 두 ColorRef, DIB undefined space와 trailing data를 검사합니다.
- 108바이트 이전의 모든 잘림, bitmap 전체의 각 잘림, record size 불일치, source 누락/불완전, bitmap이 고정 영역을 침범하는 offset, 미지원 DIB usage와 두 ColorRef 예약 바이트를 거부합니다.
- 공통 크기·색상 키/source-size/usage offset, source 필수성, 두 ColorRef, semantic end, record dispatch, signed 크기 보존, 32bpp 허용, framing 연결의 12개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 각각 실행해 36/36 검출했습니다.
- 기존 HWP corpus에서는 EMF 표본이 관측되지 않았으므로 실제 문서 호환 완료를 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.1.8 `EMR_TRANSPARENTBLT Record`
- Microsoft Win32 `TransparentBlt function`, `EMRTRANSPARENTBLT structure`
