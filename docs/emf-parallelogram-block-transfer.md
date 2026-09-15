# EMF parallelogram block transfer

## 기준과 배치

Microsoft [EMR_PLGBLT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b6c8b39d-42c7-4221-ab70-93f1e09b644e)와 [bitmap record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2a57d4bd-f3dc-45df-95fd-447382b5262a)을 기준으로 한다.

140바이트 고정부는 Bounds, destination PointL 세 개, source 원점·크기·XForm·배경색·DIB, mask 원점·DIB를 가진다. source의 좌상·우상·좌하 모서리는 destination 배열의 첫째·둘째·셋째 점에 대응한다. source와 1bpp mask DIB는 필수이며 buffer에서 어느 순서로 와도 된다.

## 책임과 SSOT

- `destination_parallelogram.zig`: 세 PointL의 wire 순서와 암시적 네 번째 점의 정확한 i64 계산
- `bitmap_pair.zig`: MASKBLT와 공유하는 source/mask 필수성, 1bpp, 순서·겹침·record 정렬
- `parallelogram_block_transfer.zig`: PLGBLT의 140바이트 field offset, signed source geometry와 trailing data
- `framing.zig`: 전체 순회 연결과 `parallelogram_block_transfer_records` 집계

암시적 네 번째 점 `D = B + C - A`는 i32 범위를 넘을 수 있으므로 parser가 wire 값을 거부하거나 wrap하지 않는다. `lowerRight`는 정확한 i64 값을 제공하고 실제 좌표 변환·clipping·bitmap 투영은 playback 계층이 담당한다. PLGBLT에는 MASKBLT와 달리 ROP4 field가 없다.

## 검증 기록

세 destination 점의 순서와 i32 극값, overflow 없는 네 번째 점, signed source 원점·크기와 mask 원점, source-first/mask-first, 필수 source/mask, 1bpp mask, bitmap span 겹침, 고정부 0~139와 동적 buffer 모든 절단, 선언/실제 크기 불일치, trailing data, 무관 Type, framing 집계와 오류 전파를 검사한다.

destination 시작 offset 이동, 네 번째 점 산식 부호 변경, 고정 길이 축소, mask BMI offset을 source offset으로 교체, Type 분류 제거, framing 집계 제거의 6개 독립 변이를 적용했다. 최초 고정 길이 축소 변이의 ReleaseFast 실행은 테스트 절단 범위도 구현의 `fixed_size`를 공유하여 회귀를 탐지하지 못했다. 공식 wire 길이 140을 독립 기대값으로 추가하고 세 모드에서 다시 실행했다. 보강 후 최종 Debug·ReleaseSafe·ReleaseFast의 `18/18` 변이 실행이 모두 실패하여 각 회귀를 탐지했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1411/1411` 테스트를 통과했다. 이 중 코어 단위 테스트는 `1372/1372`이고 차트·WMF ownership 보조 테스트가 39개다.
