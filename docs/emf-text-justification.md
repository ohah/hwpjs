# EMF text justification

## 현재 계약

`src/image/emf/text_justification.zig`는 `EMR_SETTEXTJUSTIFICATION`(0x78)의 16바이트 필수 prefix를 해석합니다. `nBreakExtra`와 `nBreakCount`는 명세대로 signed i32이며 0, 음수와 양 극값을 보정하지 않고 wire 순서 그대로 보존합니다.

일반 EMF record 호환성 정책은 `record_extent.zig`의 SSOT를 사용합니다. 필수 prefix 이후 생산자 확장 바이트는 의미 해석에 사용하지 않지만 `trailing_data` borrowed view로 보존합니다. 선언 Size와 실제 record slice가 다르거나 16바이트 prefix가 잘리면 거부합니다.

전체 EMF framing은 parser를 호출합니다. break character의 선정, 실제 extra-space 배분과 텍스트 렌더링 상태 적용은 아직 구현하지 않았습니다. 명세도 이 record 대신 `EMR_EXTTEXTOUTW` 사용을 권고합니다.

## 검증 기록

- 두 field의 0, 음수, i32 최소·최대 조합과 정확한 byte order를 검사합니다.
- 0~15의 모든 잘림, 짧거나 긴 slice에서의 선언/실제 크기 불일치, 후행 바이트 보존과 unrelated type을 검사합니다.
- dispatch, prefix·선언 크기, 두 field의 offset·endianness·signed 보존, trailing view와 framing 연결의 11개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 실행해 33/33 검출했습니다.
- 기존 HWP corpus에는 EMF 표본이 관측되지 않았으므로 실제 문서 텍스트 배치 호환 완료를 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.11.27 `EMR_SETTEXTJUSTIFICATION Record`
- Microsoft MS-EMF 2.3 generic record framing
