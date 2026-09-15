# EMF image color management mode

## 현재 계약

- `src/image/emf/icm_mode.zig`는 Microsoft [EMR_SETICMMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/a7c9d483-4a24-4058-8dc1-b5e0809ea758)의 정확한 12바이트 record를 해석합니다.
- 개별 record 명세가 Size를 `0x0000000C`로 고정하므로 일반적인 후행 extra-data 허용 규칙을 적용하지 않습니다. 선언 Size, 실제 slice와 12바이트가 모두 일치해야 합니다.
- [ICMMode enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/4935fb3c-c646-4d16-a8f0-f86ee0a9d096)의 `ICM_OFF` 1, `ICM_ON` 2, `ICM_QUERY` 3, `ICM_DONE_OUTSIDEDC` 4만 허용합니다.
- framing은 유효 record를 검사하고 `icm_mode_records`를 집계합니다. 실제 color matching·기본 profile 적용과 query 반환 동작은 playback 계층의 범위입니다.

## 검증 기록

- 네 정의값, 0..11의 모든 잘림, 짧거나 긴 선언 Size, 16바이트 확장 record 거부, 0·5·u32 최대 미정의값, unrelated dispatch와 framing 의미 오류 전달을 검사합니다.
- record dispatch, 정확 Size의 세 축, mode offset·endianness·enum domain, framing 호출·집계를 손상시키는 10개 독립 변이를 각 변이 직후 cache를 제거한 복사본에서 Debug/ReleaseSafe/ReleaseFast로 실행해 30/30 검출했습니다.
- 최초 ReleaseFast dispatch 변이는 테스트의 강제 optional unwrap이 safety 검사 없이 실행되며 무한 CPU 루프를 일으켰습니다. 제품 parser의 정상 입력 문제가 아니라 실패 테스트 자체의 UB였으며, 명시적 `orelse` 오류 반환으로 바꾼 뒤 세 모드 전체 변이를 처음부터 다시 확인했습니다.
- 전체 `audit`는 Debug, ReleaseSafe, ReleaseFast에서 모두 종료 코드 0으로 통과했으며 각 모드의 구성은 40/40 단계와 1,450/1,450 테스트입니다.
- 현재 재귀 HWP corpus에는 확인된 EMF 후보가 없으므로 실제 한글 생성기의 SETICMMODE 표본 호환성을 주장하지 않습니다.

## 근거

- Microsoft MS-EMF 2.3.11.14 `EMR_SETICMMODE Record`
- Microsoft MS-EMF 2.1.18 `ICMMode Enumeration`
