# EMF Header 가변 payload

## 명세와 책임

Microsoft [EMR_HEADER Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/de081cd7-351f-4cc2-830b-d03fb55e89ab), [Header Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e4a35c41-e8e3-43f9-bc07-a18e99bb866d), [HeaderExtension1 Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/00cc8ab4-ea2e-4bb1-9569-1201af47a0c8), [HeaderExtension2 Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/9e96e5cf-e949-49ae-baa8-3fffd948e588), [PixelFormatDescriptor Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1db036d6-2da8-4b92-b4f8-e9cab8cc93b7)를 기준으로 한다.

`header.zig`는 EMR_HEADER 종류, 선언 Size와 실제 record extent 일치, 88바이트 필수 prefix, signature, Reserved, 전체 stream Bytes와 기본 Header 필드를 소유한다. record의 공통 선언/실제 extent 검사는 `record_extent.zig`를 재사용한다.

`header_payload.zig`의 공개 `parse`가 기본 Header를 한 번만 파싱하고 Header와 가변 payload를 함께 반환한다. 따라서 서로 다른 record에서 만든 Header를 payload 파서에 주입하거나 framing이 같은 필드를 중복 해석할 수 없다.

## HeaderSize와 선택 필드

공식 HeaderSize 흐름처럼 record Size에서 시작하여 유효한 description 범위의 offset, 그보다 작은 유효한 PixelFormat 범위의 offset 순서로 HeaderSize를 줄인다. 최종값이 108 이상이면 Extension2, 100 이상이면 Extension1, 그보다 작으면 base다. 88·100·108의 정확한 경계와 PixelFormat이 description보다 앞서는 배치를 직접 검사한다.

description count와 offset은 둘 다 0이 아닐 때만 존재한다. 존재하면 88바이트 이후의 checked UTF-16LE 범위, 마지막 NUL, 공통 `text/utf16.zig`의 Unicode scalar 검사를 요구한다. 둘 중 하나만 0인 불완전 pair는 공식 흐름의 유효 범위 조건을 만족하지 않으므로 부재로 취급한다.

Extension1은 OpenGL 값 0/1만 허용한다. PixelFormat size와 offset도 둘 다 0이 아닐 때만 descriptor가 존재하며, record 계층은 100바이트 이후의 checked range만 소유한다. `pixel_format.zig`가 유일하게 40바이트 입력 크기, 내부 nSize 40, Version 1, 정의된 flag, RGBA/ColorIndex를 검사하고 모든 wire 필드와 원본 view를 보존한다. Extension2는 micrometer width/height 원값을 보존한다.

## 검증 기록과 한계

Header 선언/실제 extent, 호출자 stream size 전달, 100·108 경계, description·PixelFormat 불완전 pair, 두 가변 범위의 HeaderSize 반영, description NUL·UTF-16, OpenGL domain을 각각 깨뜨린 11개 변이는 테스트가 모두 탐지했다. 중복되어 있던 PixelFormat 외부 40바이트 검사를 제거하고 전용 파서의 단일 계약으로 통합했다. 해당 전용 크기 검사는 짧은 입력과 긴 입력을 독립 테스트한다.

정상 소스의 Debug·ReleaseSafe·ReleaseFast 전체 audit은 각 `40/40` 단계와 `1,361/1,361` 테스트를 통과했다.

저장소 실제 HWP corpus에는 EMF BinData가 없으므로 이 결과는 합성 wire fixture의 명세 대조이며 실제 생성기 호환성 완료 주장이 아니다. 렌더링과 drawing playback도 이 파트의 범위가 아니다.
