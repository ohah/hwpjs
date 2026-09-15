# EMF scanline bitmap transfer

## 기준과 배치

Microsoft [EMR_SETDIBITSTODEVICE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e8816cc6-35d2-43e6-8d88-d69cd342372e)와 [bitmap record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2a57d4bd-f3dc-45df-95fd-447382b5262a)을 기준으로 한다.

76바이트 고정부는 Bounds, destination/source 원점, source 크기, source DIB의 offset/size와 색상표 해석, 시작 scanline과 scanline 개수를 가진다. 좌표와 크기는 signed i32이고 scanline 두 필드는 unsigned u32 원값이다. BitmapBuffer는 고정부와 붙어 있지 않아도 되고 BmiSrc와 BitsSrc 사이에도 무시하는 공간을 둘 수 있다. source DIB는 필수다.

## 책임과 SSOT

- `dib_payload.zig`: 기본 전체 높이와 명시적 uncompressed scanline 수를 구분한 픽셀 바이트 검사
- `bitmap_source.zig`: 단일 source DIB의 두 undefined 구간, header/bits 순서·범위, 정렬과 DIB payload 검사
- `scanline_range.zig`: unsigned 시작/개수 덧셈 overflow와 DIB 높이 경계
- `set_dibits_to_device.zig`: SETDIBITSTODEVICE의 76바이트 field offset, signed geometry, unsigned scanline 원값과 trailing data
- `framing.zig`: 전체 순회 연결과 `set_dibits_to_device_records` 집계

Microsoft [SetDIBitsToDevice API](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-setdibitstodevice)는 `cScans`를 bits 배열에 포함된 scanline 수로 정의하며, 큰 DIB의 일부만 반복 전달하는 banding을 명시한다. 따라서 비압축 bits 길이는 전체 DIB 높이가 아니라 `cScans` 행으로 검사하고, `iStartScan + cScans`는 overflow 없이 DIB 높이 안에 있어야 한다. 비압축 BITMAPINFO의 0이 아닌 `biSizeImage`는 계속 전체 이미지 크기와 대조한다. 실제 scanline 복사와 clipping은 playback 계층의 후속 책임이다. JPEG/PNG compression은 `biSizeImage` 기반 공통 DIB 구조 검사를 통과하지만 이미지 자체 복호화·렌더링을 의미하지 않는다.

## 검증 기록

signed Bounds/destination/source 원점·크기, scanline 구간의 exact edge·범위 초과·u32 덧셈 overflow, 전체 높이보다 짧은 CORE/INFO 비압축 band와 전체 `biSizeImage`, 두 undefined 구간, 필수/불완전 source, DIBColors, 고정부 0~75와 동적 buffer 모든 절단, 선언/실제 크기 불일치, trailing data, 무관 Type, framing 집계와 오류 전파를 검사한다.

고정 길이 축소, source 좌표 offset을 destination으로 교체, 시작 scanline offset을 개수로 교체, BmiSrc offset을 BitsSrc offset으로 교체, 필수 source를 null로 완화, Type 분류 교체, framing 집계 제거, `cScans` 대신 전체 DIB 높이 사용, scanline 높이 경계 제거, INFO `biSizeImage`를 band 크기와 비교하는 10개 독립 변이를 적용했다. 대상 파서와 framing integration을 직접 import하는 임시 test root의 기준선을 먼저 확인했으며, Debug·ReleaseSafe·ReleaseFast의 `30/30` 변이 실행이 모두 실패하여 각 회귀를 탐지했다. 복원 후 세 모드 기준선도 각각 통과했으며 임시 test root는 제거했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1416/1416` 테스트를 통과했다. 이 중 코어 단위 테스트는 `1377/1377`이고 차트·WMF ownership 보조 테스트가 39개다. 재귀 HWP corpus 584개에서 EMF 후보는 0개였으므로 실파일 존재를 주장하지 않는다. 이 레코드의 직접 근거는 공식 wire 배치와 독립 합성 record, 모든 절단 및 적대적 변이 검사다.
