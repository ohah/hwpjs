# EMF pixel format record

## 현재 계약

- `src/image/emf/pixel_format_record.zig`는 Microsoft [EMR_PIXELFORMAT](https://learn.microsoft.com/ja-jp/openspecs/windows_protocols/ms-emf/ba9aa909-eb05-4d2f-a51b-10cb6df68a54)의 48바이트 필수 prefix를 해석합니다.
- record의 pfd 40바이트는 기존 `pixel_format.zig`가 단독 소유합니다. Header Extension1의 PixelFormat과 이 record는 같은 `PixelFormatDescriptor` parser를 재사용하며 필드·flag 규칙을 복제하지 않습니다.
- 선언 Size와 실제 slice 일치 및 필수 prefix는 `record_extent.zig`가 검사합니다. 명세되지 않은 record 끝 extra data는 borrowed `trailing_data`로 분리하여 descriptor에 섞지 않습니다.
- framing은 유효 record를 검사하고 `pixel_format_records`를 집계합니다. 그래픽 연산에 pixel format을 적용하는 playback 상태는 이 wire 계층의 범위가 아닙니다.

## 검증 기록

- descriptor 주요 field 위치와 원본 mask, 0..47의 모든 prefix 잘림, 선언/실제 크기 양방향 불일치, descriptor size/version 오류 전달, 후행 바이트 보존, unrelated dispatch, framing 연결을 검사합니다.
- record dispatch·prefix·descriptor slice·trailing 경계·공통 parser 호출·framing 집계 및 descriptor의 size/version/type/flag 검사를 손상시키는 14개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 실행해 42/42 검출했습니다.
- 적대적 검증 자체도 검토했습니다. 처음에는 같은 크기의 연속 소스 변이가 Zig cache에 가려졌고, `src/root.zig --test-filter PixelFormatDescriptor`가 실제 Descriptor 테스트를 수집하지 않는 문제를 각각 재현했습니다. 각 변이 직후 `.zig-cache`를 제거하고 `pixel_format.zig`를 직접 테스트하도록 고친 뒤 모든 결과를 폐기·재실행했습니다.
- 세 모드 전체 audit는 각각 1,447/1,447 테스트를 통과했습니다.
- 현재 재귀 HWP corpus에는 확인된 EMF 후보가 없으므로 실제 한글 생성기의 PIXELFORMAT 표본 호환성을 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.11.5 `EMR_PIXELFORMAT Record`
- Microsoft MS-EMF 2.2.22 `PixelFormatDescriptor Object`
