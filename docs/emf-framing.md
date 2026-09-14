# EMF header·record framing·EOF

## 명세와 책임

Microsoft [EMR_HEADER Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/de081cd7-351f-4cc2-830b-d03fb55e89ab)와 [Header Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e4a35c41-e8e3-43f9-bc07-a18e99bb866d)에 따라 EMF는 Type 1의 header record로 시작한다. 최소 크기는 Type/Size 8바이트와 Header object 80바이트를 합친 88바이트다. `header.zig`는 signature `0x464D4520`, Reserved 0, 전체 stream Bytes 일치를 검사하고 기본 Header object 필드를 보존한다. Version `0x00010000`은 MAY이므로 강제하지 않는다.

`records.zig`는 모든 EMF record의 Type/Size와 4바이트 정렬, 최소 8바이트, stream 경계를 소유한다. payload 의미는 개별 record parser의 책임이다.

Microsoft [EMR_EOF Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3f47fde0-0e6b-40c1-87f3-f4129af03aa1)에 따라 `eof.zig`는 Type 14, 최소 고정 필드와 record 마지막 SizeLast가 Size와 같은지 검사한다. palette buffer 의미는 후속 단계다.

`framing.zig`는 첫 record가 유일한 header이고 EOF가 유일한 마지막 record이며, 실제 record 수가 Header의 Records와 일치하는지 조립한다. record별 drawing/state 의미와 header description/extensions, EOF palette는 이 단계의 완료 범위가 아니다.

## Header variable fields와 extension

`header_payload.zig`는 [공식 HeaderSize flowchart](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/de081cd7-351f-4cc2-830b-d03fb55e89ab)에 따라 record Size에서 시작해 유효한 description offset과 그보다 앞선 pixel-format offset으로 고정 header 크기를 산정한다. 산정값 88/100/108 경계로 base, Extension1, Extension2를 구분하므로 긴 description이 있는 base header를 record 전체 길이만 보고 Extension으로 오인하지 않는다.

description은 둘 중 하나의 count/offset이 0이면 부재하고, 둘 다 존재하면 고정 영역 뒤의 정확한 UTF-16LE 범위와 마지막 NUL을 요구한다. Unicode scalar 검사는 공통 `text/utf16.zig`를 재사용한다. [HeaderExtension1](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/00cc8ab4-ea2e-4bb1-9569-1201af47a0c8)의 pixel format offset/40바이트 크기와 OpenGL 0/1을 검사하고 raw descriptor를 보존한다. [HeaderExtension2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9e96e5cf-e949-49ae-baa8-3fffd948e588)의 micrometer 크기를 보존한다. PixelFormatDescriptor 내부 필드는 후속 단계다.

## 적대적 검증

signature, Header Bytes, Header Records, EOF SizeLast, terminal EOF 뒤 데이터 검사를 하나씩 제거했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 각각 손상된 필드 또는 trailing data가 있는 stream을 실제 성공값으로 반환해 테스트가 탐지했다. 변이는 모두 제거하고 정상 구현을 별도로 검증한다.

절단 테스트는 오류 우선순위도 분리한다. 원래 Bytes 108을 유지한 88바이트 slice는 MissingEmfEof보다 먼저 InvalidEmfDeclaredBytes가 맞으므로, header-only와 두 번째 record 절단 fixture는 Header Bytes를 해당 slice 길이로 맞춘 뒤 각각 EOF 부재와 record 절단만 검증한다.

Header variable fields에는 description offset을 HeaderSize 산정에서 무시, 마지막 NUL 검사 제거, 실제 UTF-16 대신 빈 slice 검사, OpenGL 0/1 제한 제거, PixelFormatDescriptor 40바이트 제한 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 유효 base header 거부 또는 잘못된 description/metadata 수용으로 탐지됐다. 모든 변이를 제거한 정상 구현은 별도로 전체 검증한다.
