# EMF masked block transfer

## 기준과 배치

Microsoft [EMR_MASKBLT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e6f715c0-d034-4eb3-952e-f8ee66adb9ed)와 [bitmap record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2a57d4bd-f3dc-45df-95fd-447382b5262a)을 기준으로 한다.

128바이트 고정부는 Bounds, destination 좌표·크기, ROP4, source 좌표·XForm·배경색·DIB, mask 원점·DIB를 가진다. source와 mask DIB는 고정부와 붙을 필요가 없고 서로 어느 순서로 배치되어도 되지만 겹칠 수 없다. mask DIB는 반드시 1bpp다.

## 책임과 SSOT

- `bitmap_object.zig`: DIB 하나의 Bmi/Bits 순서, 내부 UndefinedSpace, 실제 data 범위와 payload 검사
- `bitmap_source.zig`: BITBLT 계열의 단일 선택 DIB와 고정부 이후 UndefinedSpace 조립
- `bitmap_pair.zig`: source/mask 필수성, 임의 순서, 두 전체 span의 비겹침과 buffer 의미 끝
- `quaternary_raster_operation.zig`: ignored reserved 16비트 보존과 background/foreground ROP3 index 검증
- `mask_block_transfer.zig`: MASKBLT 고정 필드, source/mask offset 집합, 1bpp mask 정책과 trailing data
- `framing.zig`: 전체 순회 연결과 `mask_block_transfer_records` 집계

ROP4의 Reserved는 명세대로 0이 아니어도 보존하고 무시한다. BackgroundROP3와 ForegroundROP3는 TernaryRasterOperation SSOT에 실제 정의된 index인지 각각 검사한다. 실제 mask 복제와 foreground/background 픽셀 합성은 playback 계층의 후속 책임이다.

4바이트 AlignmentPadding은 각 DIB 뒤의 속성이 아니라 bitmap record 전체 끝의 속성이다. 따라서 `bitmap_object.zig`는 `Bits`의 실제 끝까지만 소유하고, 단일 source 또는 pair 조립기가 마지막 DIB의 최대 data 끝을 기준으로 record padding을 한 번만 계산한다. 이 구분으로 첫 DIB의 unaligned 끝 직후 두 번째 DIB가 시작하는 합법적 배치를 막지 않는다.

## 검증 기록

ROP4 byte 순서와 reserved 보존, 양쪽 index 범위, signed 좌표, source-first와 mask-first, 두 DIB 사이 공백, 1bpp mask, 누락 bitmap, 겹침, 고정부 모든 절단, 동적 buffer 모든 절단, 선언/실제 크기 불일치, 무관 Type, framing 오류 전파를 검사한다.

DIB span 겹침 검사 제거, mask 1bpp 정책 제거, ROP4 foreground/background byte 교환, source-first 순서 강제, Type 분류 제거, framing 집계 제거의 6개 독립 변이를 적용했다. Debug·ReleaseSafe·ReleaseFast의 `18/18` 변이 실행이 모두 실패하여 각 회귀를 탐지했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1407/1407` 테스트를 통과했다. 이 중 코어 단위 테스트는 `1368/1368`이고 차트·WMF ownership 보조 테스트가 39개다.
