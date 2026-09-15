# EMF bit block transfer

## 기준과 범위

Microsoft [EMR_BITBLT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/347d1c44-1847-47ec-8762-7059e9e9b185), [bitmap record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2a57d4bd-f3dc-45df-95fd-447382b5262a), [TernaryRasterOperation](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/1605dd68-a635-4639-ab81-99ff3e3fc5a3)을 기준으로 한다.

`EMR_BITBLT`의 100바이트 고정부와 선택적 source DIB를 읽는다. Bounds, destination 좌표·크기, source 좌표, XForm의 FLOAT 비트, source 배경 ColorRef, DIBColors와 ROP3 원시값을 보존한다. 실제 픽셀 합성, 좌표 변환 적용과 렌더링은 playback 계층의 후속 범위다.

## 책임과 SSOT

- `ternary_raster_operation.zig`: 공식 250개 ROP3 값의 단일 표, 32비트 wire 값·상위 연산 index·하위 operation code 보존과 8비트 진리표 기반 source 의존성 판정
- `bitmap_source.zig`: 네 offset/size의 부재·완전성, `UndefinedSpace1/2`, 순서·겹침·overflow·정렬 경계와 DIB payload 조립
- `bit_block_transfer.zig`: BITBLT 고정 필드와 선택 bitmap 정책 조립, 의미 payload 뒤 extra data 분리
- `framing.zig`: 전체 record 순회 연결과 `bit_block_transfer_records` 집계

Microsoft의 현재 TernaryRasterOperation HTML에는 250개 열거값이 있으며 256개 index 중 6개는 정의되지 않는다. 0x39 값은 `0390604`로 한 자리가 부족하고 0x57 값은 `000570389`로 한 자리가 많으므로, 각 항목에 함께 명시된 index와 하위 16비트 operation code를 기준으로 각각 `00390604`, `00570389`로 정규화했다. 표는 정확히 250개인지 테스트하며, 상위 index와 하위 code가 표의 같은 값이 아닌 조합 및 6개 미정의 index는 거부한다. source 필요 여부는 이름이나 휴리스틱이 아니라 index의 P/S/D 진리표에서 S를 바꿨을 때 결과가 달라지는지 계산한다.

BitmapBuffer는 고정부와 붙어 있을 필요가 없으며 BmiSrc와 BitsSrc 사이도 `UndefinedSpace2`가 허용된다. 네 offset/size가 모두 0이면 부재, 일부만 0이면 불완전 오류다. BmiSrc는 고정부 이후이고 BitsSrc는 BmiSrc 이후여야 하며 두 범위는 겹칠 수 없다. ROP 진리표가 source에 의존하는데 bitmap이 없으면 거부한다.

## 검증 기록

SRCCOPY와 PATCOPY/DSTINVERT source 의존성, signed 좌표, FLOAT 특수 비트, ColorRef 예약 바이트, DIBColors, 고정부의 모든 절단, 선언/실제 크기 불일치, source 생략, 네 필드 일부 누락, 두 UndefinedSpace, 겹침, 고정부 침범, u32 덧셈 overflow, record 밖 extent, 정렬 부족, DIB header·bits 검증, 무관 Type, framing 집계와 오류 전파를 검사한다.

source 의존성 제거, `cbBitsSrc == 0` 부분 상태 허용, BmiSrc/BitsSrc 겹침 허용, Type 분류 제거, source 필수 검사 제거, ROP3 하위 code 대조 제거의 6개 독립 변이를 적용했다. 최초 부분 상태 변이는 기존 테스트가 `offBitsSrc == 0`도 함께 바꾼 사례만 가져 탐지하지 못했다. `cbBitsSrc`만 0인 직교 사례를 추가한 뒤 다시 실행했으며 Debug·ReleaseSafe·ReleaseFast의 최종 `18/18` 변이 실행이 모두 실패해 각 회귀를 탐지했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1398/1398` 테스트를 통과했다. 이 중 코어 단위 테스트는 `1359/1359`이고 차트·WMF ownership 보조 테스트가 39개다.
