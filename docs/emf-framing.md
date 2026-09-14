# EMF header·record framing·EOF

## 명세와 책임

Microsoft [EMR_HEADER Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/de081cd7-351f-4cc2-830b-d03fb55e89ab)와 [Header Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e4a35c41-e8e3-43f9-bc07-a18e99bb866d)에 따라 EMF는 Type 1의 header record로 시작한다. 최소 크기는 Type/Size 8바이트와 Header object 80바이트를 합친 88바이트다. `header.zig`는 signature `0x464D4520`, Reserved 0, 전체 stream Bytes 일치를 검사하고 기본 Header object 필드를 보존한다. Version `0x00010000`은 MAY이므로 강제하지 않는다.

`records.zig`는 모든 EMF record의 Type/Size와 4바이트 정렬, 최소 8바이트, stream 경계를 소유한다. [RecordType Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1eec80ba-799b-4784-a9ac-91597d590ae1)의 119개 값을 단일 enum으로 보존하고, 정의되지 않은 `0x45`, `0x6B`, `0x75` 및 범위 밖 값을 거부한다. payload 의미는 개별 record parser의 책임이다.

Microsoft [EMR_EOF Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3f47fde0-0e6b-40c1-87f3-f4129af03aa1)에 따라 `eof.zig`는 Type 14, 최소 고정 필드와 record 마지막 SizeLast가 Size와 같은지 검사한다.

`framing.zig`는 첫 record가 유일한 header이고 EOF가 유일한 마지막 record이며, 실제 record 수가 Header의 Records와 일치하는지 조립한다. record별 drawing/state 의미는 이 단계의 완료 범위가 아니다.

`path_bracket.zig`는 [Path Bracket Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b930b989-30ec-4954-a889-1dc60ce0b689)의 `BEGINPATH`, `ENDPATH`, `CLOSEFIGURE`, `FLATTENPATH`, `WIDENPATH`, `ABORTPATH`만 분류한다. 여섯 record는 매개변수가 없으므로 정확히 8바이트여야 하며, 다른 Type을 이 집합으로 오인하지 않는다. State는 열린 construction에서 BEGINPATH를 거부하고, EOF 전에 END/ABORT로 닫혔는지 검사한다. `framing.zig`가 구조와 상태 검증을 전체 stream 순회에 연결한다. CLOSEFIGURE의 open-figure 권고와 실제 path drawing 의미는 별도 재생 계층의 책임이다.

`xform.zig`는 [XForm Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e84107e9-bc2b-4a14-9234-5d173adc1b59)의 M11, M12, M21, M22, Dx, Dy를 24바이트 wire 순서로 읽고 FLOAT 원시 비트를 보존한다. 문서에 finite 제약이 없으므로 NaN·Infinity를 임의 거부하지 않는다. `transform_records.zig`는 [SETWORLDTRANSFORM](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/985724c0-4db1-48f0-b346-67288b3288cb)의 정확한 32바이트와 [MODIFYWORLDTRANSFORM](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c70b85e5-8c31-418f-a7b8-349e417e0f76)의 정확한 36바이트를 구분한다. 후자는 [ModifyWorldTransformMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e6bb2996-195f-473f-80c6-9dc1afe474f9)의 Identity/LeftMultiply/RightMultiply/Set 1~4만 허용한다. framing은 두 레코드의 구조 검증을 전체 stream에 연결하며 실제 행렬 합성은 재생 계층의 책임이다.

## Header variable fields와 extension

`header_payload.zig`는 [공식 HeaderSize flowchart](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/de081cd7-351f-4cc2-830b-d03fb55e89ab)에 따라 record Size에서 시작해 유효한 description offset과 그보다 앞선 pixel-format offset으로 고정 header 크기를 산정한다. 산정값 88/100/108 경계로 base, Extension1, Extension2를 구분하므로 긴 description이 있는 base header를 record 전체 길이만 보고 Extension으로 오인하지 않는다.

description은 둘 중 하나의 count/offset이 0이면 부재하고, 둘 다 존재하면 고정 영역 뒤의 정확한 UTF-16LE 범위와 마지막 NUL을 요구한다. Unicode scalar 검사는 공통 `text/utf16.zig`를 재사용한다. [HeaderExtension1](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/00cc8ab4-ea2e-4bb1-9569-1201af47a0c8)의 pixel format offset/40바이트 크기와 OpenGL 0/1을 검사한다. [HeaderExtension2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9e96e5cf-e949-49ae-baa8-3fffd948e588)의 micrometer 크기를 보존한다.

`pixel_format.zig`는 [PixelFormatDescriptor Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1db036d6-2da8-4b92-b4f8-e9cab8cc93b7)의 40바이트 필드를 모두 파싱하고 원본 view도 보존한다. 정확한 입력 길이와 내부 nSize, Version 1, 정의된 flag bit, RGBA/ColorIndex enum을 검증하며 `PFD_DOUBLEBUFFER`와 `PFD_SUPPORT_GDI` 동시 설정을 거부한다. 문서가 MAY/SHOULD-ignore로 둔 layer type, reserved nibble, layer/damage mask와 각 bit count는 임의 제한 없이 보존한다. `cbPixelFormat` 또는 `offPixelFormat` 중 하나라도 0이면 descriptor가 없다는 레코드 규칙도 유지한다.

## 적대적 검증

signature, Header Bytes, Header Records, EOF SizeLast, terminal EOF 뒤 데이터 검사를 하나씩 제거했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 각각 손상된 필드 또는 trailing data가 있는 stream을 실제 성공값으로 반환해 테스트가 탐지했다. 변이는 모두 제거하고 정상 구현을 별도로 검증한다.

절단 테스트는 오류 우선순위도 분리한다. 원래 Bytes 108을 유지한 88바이트 slice는 MissingEmfEof보다 먼저 InvalidEmfDeclaredBytes가 맞으므로, header-only와 두 번째 record 절단 fixture는 Header Bytes를 해당 slice 길이로 맞춘 뒤 각각 EOF 부재와 record 절단만 검증한다.

Header variable fields에는 description offset을 HeaderSize 산정에서 무시, 마지막 NUL 검사 제거, 실제 UTF-16 대신 빈 slice 검사, OpenGL 0/1 제한 제거, PixelFormatDescriptor 40바이트 제한 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 유효 base header 거부 또는 잘못된 description/metadata 수용으로 탐지됐다. 모든 변이를 제거한 정상 구현은 별도로 전체 검증한다.

## EOF palette

Microsoft [EMR_EOF](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3f47fde0-0e6b-40c1-87f3-f4129af03aa1)의 palette offset은 record 시작 기준이며 모든 entry는 마지막 SizeLast 앞에 있어야 한다. `eof_palette.zig`는 offset 앞뒤 undefined space를 별도 raw view로 보존하고, [LogPaletteEntry](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c1f7b285-be16-4112-a4e6-0b2fd4c1d148)의 Reserved/Blue/Green/Red 순서를 accessor에서 해석한다. Reserved는 MUST-ignore이므로 0으로 강제하지 않는다. Header와 EOF의 palette entry count는 framing에서 일치시킨다.

EOF palette에는 Header/EOF count 비교 제거, offset 15를 16으로 보정, SizeLast 앞 공간을 넘는 entry bytes를 조용히 절단, Blue/Red 순서 교환, 뒤 undefined space 손실의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 불일치 수용, 잘못된 byte 소유, entry 손실, 채널 교환 또는 raw data 손실로 탐지됐다. 모든 변이를 제거한 정상 구현은 별도로 전체 검증한다.

PixelFormatDescriptor에는 내부 nSize 검사 제거, Version 검사 제거, 미정의 flag 허용, DOUBLEBUFFER/GDI 금지 조합 허용, 미정의 pixel type 허용의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 해당 손상값 수용으로 탐지됐다. 정상 구현 복원 후 세 모드 전체 테스트와 Debug 통합 audit 8,905,815 checks도 통과했다.

RecordType enum에는 미정의 `0`, 예약값 `0x45`, 예약값 `0x6B`, 예약값 `0x75`, 미정의 `0x7B`를 각각 멤버로 추가하는 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 미정의 Type 수용과 enum 개수 변화로 탐지됐다. 모든 변이 멤버를 제거한 정상 구현은 세 모드 전체 테스트와 Debug 통합 audit 8,905,815 checks를 통과했다. 공식 HTML에서 독립 추출한 119개 값과 구현 enum을 순서대로 비교해 missing/extra 0도 확인했다.

Path Bracket에는 8바이트 크기 검사 제거, BEGINPATH 분류 제거, ABORTPATH 분류 제거, SAVEDC를 잘못 분류, framing 연결 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 크기·집합·통합 계약으로 탐지됐다.

상태 규칙에는 nested BEGIN 검사 제거, BEGIN의 open 갱신 제거, END의 close 갱신 제거, ABORT의 close 갱신 제거, EOF 미종료 검사 제거의 5개 변이를 추가 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 상태·통합 계약으로 탐지됐다. 구조 검증과 합치면 이 파트의 적대적 실행은 30/30이다. 모든 변이를 제거한 정상 구현은 세 모드 전체 테스트와 Debug 통합 audit 8,905,815 checks를 통과했다.

World Transform에는 XForm 24바이트 검사 제거, SET 크기 검사 제거, MODIFY 크기 검사 제거, 미정의 mode 허용, framing 연결 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 객체·레코드·통합 계약으로 탐지됐다. XForm 절단 변이는 Debug/ReleaseSafe에서 경계 trap, ReleaseFast에서 초과 입력 수용으로 탐지됐으며 나머지는 모두 명시적 계약 실패였다. 모든 변이를 제거한 정상 구현은 세 모드 전체 테스트와 Debug 통합 audit 8,905,815 checks를 통과했다.
