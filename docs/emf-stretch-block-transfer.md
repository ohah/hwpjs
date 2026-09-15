# EMF stretch block transfer

## 기준과 배치

Microsoft [EMR_STRETCHBLT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/0dd551f3-80f7-4852-89c2-9ddba803a192)와 [bitmap record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2a57d4bd-f3dc-45df-95fd-447382b5262a)을 기준으로 한다.

STRETCHBLT는 BITBLT와 같은 처음 100바이트 뒤에 signed `cxSrc`, `cySrc`가 추가된 108바이트 고정부다. 이후 BitmapBuffer 배치와 ROP3에 따른 source 생략 정책은 BITBLT와 동일하다.

## 책임과 SSOT

- `bit_blt_core.zig`: 두 record가 공유하는 Bounds, destination, ROP3, source 좌표·XForm·배경색·DIB usage·offset과 source 필요 정책
- `stretch_block_transfer.zig`: STRETCHBLT Type, 108바이트 고정 경계, signed source 크기, record별 오류와 trailing data
- `bitmap_source.zig`: 두 optional UndefinedSpace와 DIB 범위·payload 검증
- `framing.zig`: `stretch_block_transfer_records` 집계와 오류 전파

BITBLT 파서는 108바이트 배치를 추측하지 않으며 STRETCHBLT 파서는 100바이트에서 bitmap을 시작하도록 허용하지 않는다. bitmap stretching, StretchMode·ColorAdjustment 적용과 픽셀 출력은 playback 계층의 후속 책임이다.

## 검증 기록

signed source width/height와 공통 필드, 108바이트 이후 UndefinedSpace1, 비연속 BmiSrc/BitsSrc, extra data, source 비의존 ROP의 bitmap 생략, source 의존 ROP의 누락, 0~107 모든 고정 절단, 108~139 모든 동적 절단, 선언/실제 크기 불일치, 무관 Type, framing 집계와 오류 전파를 검사한다.

source 크기 offset 이동, 고정 길이 8바이트 축소, 공통 코어에 잘못된 100바이트 fixed-end 전달, Type 분류 제거, framing 집계 제거의 5개 독립 변이를 적용했다. Debug·ReleaseSafe·ReleaseFast의 `15/15` 변이 실행이 모두 실패하여 해당 회귀를 탐지했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1402/1402` 테스트를 통과했다. 이 중 코어 단위 테스트는 `1363/1363`이고 차트·WMF ownership 보조 테스트가 39개다.
