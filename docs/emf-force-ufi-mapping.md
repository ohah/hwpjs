# EMF forced universal font mapping

## 현재 계약

- `src/image/emf/force_ufi_mapping.zig`는 Microsoft [EMR_FORCEUFIMAPPING](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e9a05924-e704-4037-8312-6bef2e19f6bd)의 16바이트 필수 prefix를 해석합니다.
- ufi의 Checksum과 Index는 `universal_font_id.zig`의 공통 8바이트 parser가 단독 소유합니다. 이 record parser는 같은 wire 정의를 복제하지 않습니다.
- 선언 Size와 실제 slice 일치 및 필수 prefix는 `record_extent.zig`가 검사합니다. 명세되지 않은 record 끝 extra data는 borrowed `trailing_data`로 분리해 보존하고 의미 필드에 섞지 않습니다.
- 전체 framing은 유효 record를 검사하고 `force_ufi_mapping_records`를 집계합니다. 실제 font mapper 우선순위와 playback device context 갱신은 이 wire 계층의 범위가 아닙니다.

## 검증 기록

- Checksum/Index의 독립 byte 위치와 극값, 0..15의 모든 prefix 잘림, 선언/실제 길이 양방향 불일치, 후행 바이트 보존, unrelated dispatch, framing 연결과 다음 EOF 경계를 검사합니다.
- UFI field offset·endianness, record dispatch, 필수 prefix와 선언 길이, trailing 분리, 공통 UFI parser 호출, framing 호출·집계의 10개 독립 변이를 Debug/ReleaseSafe/ReleaseFast에서 실행해 30/30 검출했습니다. PIXELFORMAT 검증에서 연속 변이 사이에도 cache가 개입할 수 있음을 확인한 뒤, 각 변이 직후 `.zig-cache`를 제거하는 강화된 실행으로 30회 전체를 다시 측정했습니다.
- 세 모드 전체 audit는 각각 1,444/1,444 테스트를 통과했습니다.
- 현재 재귀 HWP corpus에는 확인된 EMF 후보가 없으므로 실제 한글 생성기의 FORCEUFIMAPPING 표본 호환성을 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.11.2 `EMR_FORCEUFIMAPPING Record`
- Microsoft MS-EMF 2.2.27 `UniversalFontId Object`
