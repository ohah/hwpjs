# EMF stretched DIB transfer

## 기준과 배치

Microsoft [EMR_STRETCHDIBITS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/89c0d808-0dea-413f-be40-2e9e51fa36ac)와 [bitmap record 공통 규칙](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2a57d4bd-f3dc-45df-95fd-447382b5262a)을 기준으로 한다.

80바이트 고정부는 Bounds, destination/source 원점, source 크기, source DIB offset/size와 색상표 해석, ROP3, destination 크기를 가진다. 모든 좌표와 크기는 signed i32다. source와 destination 너비 또는 높이의 부호가 다르면 해당 축의 mirror copy를 뜻한다.

## 책임과 SSOT

- `bitmap_source.zig`: 선택적인 단일 source DIB의 undefined 구간, header/bits 범위·정렬과 payload 검사
- `ternary_raster_operation.zig`: 250개 정의된 ROP3 wire 값과 source 의존성 진리표
- `stretch_dibits.zig`: 80바이트 field offset, signed geometry, ROP에 따른 source 필수성과 trailing data
- `framing.zig`: 전체 순회 연결과 `stretch_dibits_records` 집계

ROP3가 source에 의존하지 않을 때만 네 DIB offset/size가 모두 0인 생략을 허용한다. 일부만 0이면 불완전 bitmap 오류다. 실제 stretch, mirror, clipping, brush 조합과 color adjustment 적용은 playback 계층의 후속 책임이다. JPEG/PNG compression의 구조 검사는 공통 DIB 계층이 수행하지만 이미지 복호화·렌더링을 의미하지 않는다.

## 검증 기록

signed Bounds와 source/destination의 모든 원점·크기, 부호가 다른 크기 원값, ROP3와 Usage, 두 undefined 구간, ROP별 source 생략·필수, 불완전 source, 고정부 0~79와 동적 buffer 모든 절단, 선언/실제 크기 불일치, trailing data, 무관 Type, framing 집계와 오류 전파를 검사한다.

고정 길이 축소, source 원점을 destination offset으로 교체, destination 크기를 source 크기로 교체, ROP offset을 Usage로 교체, bitmap에 잘못된 76바이트 fixed-end 전달, BmiSrc offset을 BitsSrc offset으로 교체, ROP source 필수 검사 제거, Type 분류 교체, trailing data 손실, framing 집계 제거의 10개 독립 변이를 적용했다. 대상 파서와 framing integration을 직접 import하는 임시 test root의 기준선을 먼저 확인했으며, Debug·ReleaseSafe·ReleaseFast의 `30/30` 변이 실행이 모두 실패하여 각 회귀를 탐지했다. 복원 후 세 모드 기준선도 각각 통과했고 임시 test root는 제거했다.

최종 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 `40/40` 단계와 `1419/1419` 테스트를 통과했다. 이 중 코어 단위 테스트는 `1380/1380`이고 차트·WMF ownership 보조 테스트가 39개다. 재귀 HWP corpus 584개에서 EMF 후보는 0개였으므로 실파일 존재를 주장하지 않는다. 이 레코드의 직접 근거는 공식 wire 배치와 독립 합성 record, 모든 절단 및 적대적 변이 검사다.
