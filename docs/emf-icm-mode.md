# EMF image color management mode

## 현재 계약

- `src/image/emf/icm_mode.zig`는 Microsoft [EMR_SETICMMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/a7c9d483-4a24-4058-8dc1-b5e0809ea758)의 12바이트 필수 prefix를 해석합니다.
- 선언 Size와 실제 slice가 일치해야 하며 12바이트보다 짧을 수 없습니다. Microsoft [EMF record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e0137630-f3ad-492c-bde9-e68866e255ba)에 따라 명세되지 않은 끝의 extra data는 거부하지 않고 `trailing_data`로 분리해 mode에 섞지 않습니다. 이 extent 판정은 `record_extent.zig`를 재사용합니다.
- [ICMMode enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/4935fb3c-c646-4d16-a8f0-f86ee0a9d096)의 `ICM_OFF` 1, `ICM_ON` 2, `ICM_QUERY` 3, `ICM_DONE_OUTSIDEDC` 4만 허용합니다.
- framing은 유효 record를 검사하고 `icm_mode_records`를 집계합니다. 실제 color matching·기본 profile 적용과 query 반환 동작은 playback 계층의 범위입니다.

## 검증 기록

- 네 정의값, 0..11의 모든 잘림, 짧거나 긴 선언 Size, 16바이트 확장 record의 후행 분리, 0·5·u32 최대 미정의값, unrelated dispatch와 framing 의미 오류 전달을 검사합니다.
- 2026-09-16 공식 상위 규칙과 다시 대조해, 최초 구현의 정확 12바이트 제한과 이를 지지하던 문서·테스트가 잘못됐음을 확인했습니다. 이전 30/30 변이 및 1,450개 audit 기록은 잘못된 계약의 완료 근거로 사용하지 않고 이 교정 기록으로 대체합니다.
- record dispatch, 필수 prefix·선언 일치·exact-size 회귀·후행 분리, mode offset·endianness·enum domain, framing 호출·집계를 손상시키는 11개 독립 변이를 각 변이 직후 cache를 제거한 복사본에서 Debug/ReleaseSafe/ReleaseFast로 실행해 33/33 검출했습니다.
- 최초 ReleaseFast dispatch 변이는 테스트의 강제 optional unwrap이 safety 검사 없이 실행되며 무한 CPU 루프를 일으켰습니다. 제품 parser의 정상 입력 문제가 아니라 실패 테스트 자체의 UB였으며, 명시적 `orelse` 오류 반환으로 바꾼 뒤 세 모드 전체 변이를 처음부터 다시 확인했습니다.
- 교정과 확장 record framing 테스트를 모두 반영한 최종 `audit`는 Debug, ReleaseSafe, ReleaseFast에서 각각 40/40 단계와 1,450/1,450 테스트를 통과했습니다.
- 현재 재귀 HWP corpus에는 확인된 EMF 후보가 없으므로 실제 한글 생성기의 SETICMMODE 표본 호환성을 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.11.14 `EMR_SETICMMODE Record`
- Microsoft MS-EMF 2.1.18 `ICMMode Enumeration`
- Microsoft MS-EMF 2.3 `EMF Records`
