# EMF header·record framing·EOF

## 명세와 책임

Microsoft [EMR_HEADER Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/de081cd7-351f-4cc2-830b-d03fb55e89ab)와 [Header Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e4a35c41-e8e3-43f9-bc07-a18e99bb866d)에 따라 EMF는 Type 1의 header record로 시작한다. 최소 크기는 Type/Size 8바이트와 Header object 80바이트를 합친 88바이트다. `header.zig`는 signature `0x464D4520`, Reserved 0, 전체 stream Bytes 일치를 검사하고 기본 Header object 필드를 보존한다. Version `0x00010000`은 MAY이므로 강제하지 않는다.

`records.zig`는 모든 EMF record의 Type/Size와 4바이트 정렬, 최소 8바이트, stream 경계를 소유한다. [RecordType Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1eec80ba-799b-4784-a9ac-91597d590ae1)의 119개 값을 단일 enum으로 보존하고, 정의되지 않은 `0x45`, `0x6B`, `0x75` 및 범위 밖 값을 거부한다. payload 의미는 개별 record parser의 책임이다.

Microsoft [EMR_EOF Record](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/3f47fde0-0e6b-40c1-87f3-f4129af03aa1)에 따라 `eof.zig`는 Type 14, 최소 고정 필드와 record 마지막 SizeLast가 Size와 같은지 검사한다.

`framing.zig`는 첫 record가 유일한 header이고 EOF가 유일한 마지막 record이며, 실제 record 수가 Header의 Records와 일치하는지 조립한다. record별 drawing/state 의미는 이 단계의 완료 범위가 아니다.

`path_bracket.zig`는 [Path Bracket Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b930b989-30ec-4954-a889-1dc60ce0b689)의 `BEGINPATH`, `ENDPATH`, `CLOSEFIGURE`, `FLATTENPATH`, `WIDENPATH`, `ABORTPATH`만 분류한다. 여섯 record는 매개변수가 없으므로 정확히 8바이트여야 하며, 다른 Type을 이 집합으로 오인하지 않는다. State는 열린 construction에서 BEGINPATH를 거부하고, EOF 전에 END/ABORT로 닫혔는지 검사한다. `framing.zig`가 구조와 상태 검증을 전체 stream 순회에 연결한다. CLOSEFIGURE의 open-figure 권고와 실제 path drawing 의미는 별도 재생 계층의 책임이다.

`xform.zig`는 [XForm Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e84107e9-bc2b-4a14-9234-5d173adc1b59)의 M11, M12, M21, M22, Dx, Dy를 24바이트 wire 순서로 읽고 FLOAT 원시 비트를 보존한다. 문서에 finite 제약이 없으므로 NaN·Infinity를 임의 거부하지 않는다. `transform_records.zig`는 [SETWORLDTRANSFORM](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/985724c0-4db1-48f0-b346-67288b3288cb)의 정확한 32바이트와 [MODIFYWORLDTRANSFORM](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c70b85e5-8c31-418f-a7b8-349e417e0f76)의 정확한 36바이트를 구분한다. 후자는 [ModifyWorldTransformMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e6bb2996-195f-473f-80c6-9dc1afe474f9)의 Identity/LeftMultiply/RightMultiply/Set 1~4만 허용한다. framing은 두 레코드의 구조 검증을 전체 stream에 연결하며 실제 행렬 합성은 재생 계층의 책임이다.

`geometry.zig`는 [MS-WMF PointL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/4eeaf09e-e41a-491c-93a1-7aec0afd4f96), [SizeL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/17b541c5-f8ee-4111-b1f2-012128f35871), [RectL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/fe9329f4-7a87-4025-9a8a-541ee21e6530)의 signed 32비트 wire 해석을 단독 소유한다. 기존 EMF header도 이 SSOT를 재사용한다. `point_records.zig`는 SETWINDOWEXTEX/ORGEX, SETVIEWPORTEXTEX/ORGEX, SETBRUSHORGEX, MOVETOEX의 정확한 16바이트 크기와 PointL/SizeL 의미를 구분하고 framing에 연결한다. LINETO처럼 배치가 같아도 이 State Record 집합이 아닌 타입은 claim하지 않는다.

`mode_records.zig`는 12바이트인 [SETMAPMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/aa4ad35d-fa42-4a4f-959a-8b41304e1b05), [SETBKMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/7c584a42-b6dd-47b8-a0b6-f529133292f4), [SETPOLYFILLMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e8799c80-fe74-45c1-bf6d-3eb78edd4ed2), [SETROP2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/cedee7e0-4e66-47b6-ae1d-816e1e319786), [SETSTRETCHBLTMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/ff00ab98-6e2c-4eca-b664-04ab2956b6a5), [SETARCDIRECTION](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/83a955e6-13b8-4720-a521-542e3dd91cba)을 소유한다. MapMode·BackgroundMode·PolygonFillMode·BinaryRasterOperation·ArcDirection은 각 공식 enum 밖의 값을 거부한다. StretchMode는 레코드 명세가 enum 값일 수 있다고 `MAY`로 규정하므로 u32 원값을 항상 보존하고, 알려진 1~4만 optional enum으로 함께 제공한다. framing은 여섯 레코드를 전체 stream 검사에 연결하며 그래픽 상태 적용과 raster 연산은 재생 계층의 책임이다.

`color_records.zig`는 정확히 12바이트인 [SETTEXTCOLOR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1ae5c616-cf8e-4f5d-a7c3-bfc1f70ece28)와 [SETBKCOLOR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/24f40952-62d4-40b0-ba40-aad8fb4fc421)을 구분한다. 색상 객체는 새로 복제하지 않고 기존 WMF `color_ref.zig`를 SSOT로 재사용한다. [ColorRef](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/0fdf54fc-6357-4cdd-b27f-795dee14cf86)의 Red/Green/Blue wire 순서와 Reserved `MUST be 0x00`을 적용하고 raw u32도 보존한다. framing은 두 레코드를 전체 stream 검사에 연결하며 색상 상태 적용은 재생 계층의 책임이다.

`mapper_flags.zig`는 정확히 12바이트인 [SETMAPPERFLAGS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/6647abf7-bd70-43ef-8766-1a6e06ed2f03)의 두 정의값을 구분한다. 값 0은 font mapper를 장치 종횡비와 무관하게 두고, 값 1은 장치 종횡비와 일치하는 font 선택을 지시한다. 그 밖의 값은 정의되지 않았으므로 거부한다. `miter_limit.zig`는 정확히 12바이트인 [SETMITERLIMIT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2637d0d0-92dd-48e8-be5e-6400b4d1fc5e)의 원시 DWORD를 보존한다. 본문은 UINT32로 정의하지만 제품 동작 주석은 Windows GDI가 FLOAT도 받는다고 명시하므로, 같은 raw 비트의 unsigned/float view를 모두 제공하고 NaN·Infinity를 정규화하거나 거부하지 않는다. 두 파서는 상태 적용 없이 framing 검증만 담당한다.

`text_alignment.zig`는 정확히 12바이트인 [SETTEXTALIGN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/a49bb565-a583-41da-8d4a-8a0314b3e397)의 DWORD mask를 보존한다. [TextAlignmentMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/2cf0d802-5db7-42f6-bb75-50ff195a6c7c)의 UPDATECP와 RTL, 두 축 그룹 `0/2/6`과 `0/8/24`만 허용하고 `4`, `16`, 미정의 비트를 거부한다. 같은 숫자는 현재 글꼴의 baseline에 따라 [VerticalTextAlignmentMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/2475d008-f5ff-4c93-b28b-3953818b8827)로 다르게 해석된다. 이 레코드만으로 baseline을 알 수 없으므로 파서는 축 그룹을 중립적으로 보존하며, 수평/수직 의미 선택은 글꼴 상태를 가진 재생 계층의 책임이다.

`text_justification.zig`는 정확히 16바이트인 [SETTEXTJUSTIFICATION](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/edbc2be0-1da0-45d6-9c05-677cbcaa2d47)의 nBreakExtra와 nBreakCount를 signed i32 wire 순서로 보존한다. 명세에 별도 값 범위가 없으므로 음수와 극값을 임의 보정하지 않는다. `scale_extents.zig`는 같은 24바이트 배치인 [SCALEVIEWPORTEXTEX](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/469e353c-4209-4919-a5aa-9331b60765ed)와 [SCALEWINDOWEXTEX](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/01698f29-bbcb-4100-9bad-0fd52c33b0da)를 구분한다. x/y numerator와 denominator 네 필드는 모두 signed i32이고 모두 0을 금지한다. 실제 곱셈·나눗셈과 fixed-scale mapping mode에서의 적용 여부는 overflow 및 상태 정책이 필요한 재생 계층의 책임이다.

`dc_stack.zig`는 매개변수가 없는 정확히 8바이트의 [SAVEDC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/8f8a4df2-f8d7-4d39-afc0-94e19f524652)와 정확히 12바이트의 [RESTOREDC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/efa2f180-4c7e-4a7b-b4ef-a1d06a0ce89f)를 구분한다. SavedDC는 반드시 음수이며 `-k`는 현재 stack의 k번째 저장 상태를 복원하면서 그 상태와 더 최신 상태를 제거한다. framing은 저장 depth를 추적하여 존재하지 않는 상태 복원을 거부한다. EOF에서 남은 저장 상태를 모두 복원해야 한다는 명세는 없으므로 stack이 비어야 한다는 제약은 추가하지 않는다. 실제 그래픽 속성 snapshot은 재생 계층의 책임이다.

`log_palette_entry.zig`는 [LogPaletteEntry](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c1f7b285-be16-4112-a4e6-0b2fd4c1d148)의 Reserved/Blue/Green/Red 순서를 단독 소유하며 EOF palette와 `palette_records.zig`가 이를 공유한다. Reserved는 MUST-ignore이므로 값을 보존한다. `palette_records.zig`는 [CREATEPALETTE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/07e1492b-e4bb-4394-934f-4eaee67ab8ff), [SELECTPALETTE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e6a4ce2a-209d-43df-b763-5d8e54c21a10), [SETPALETTEENTRIES](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/88348296-3c9a-488f-bbf7-19c897535372), [RESIZEPALETTE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/ec789332-96b5-4bb8-9d7c-8b5c8c0da8b9), REALIZEPALETTE를 구분한다. CREATE는 LogPalette version 0x0300과 1개 이상의 count-derived 정확한 entry 배열을, SELECT는 정확한 12바이트와 non-stock handle 또는 [StockObject](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/d6dffd25-8615-42f8-aed1-309f1fe54ab2)의 유일한 palette 값 `DEFAULT_PALETTE(0x8000000F)`를, SET은 count-derived 정확한 배열과 non-stock handle을, RESIZE는 정확한 16바이트·non-stock handle·1..0x400개를, REALIZE는 매개변수 없는 정확한 8바이트를 요구한다.

`palette_records.zig`는 각 레코드의 wire 계약만 소유한다. handle이 Header Handles 범위에 있는지, CREATE가 빈 slot을 쓰는지, SELECT/SET/RESIZE가 살아 있는 LogPalette를 가리키는지, Start+count가 현재 palette 크기를 넘는지는 아래 [EMF Object Table](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e4fa4e63-9096-4cdc-b776-85e2a1e4e1f4) 상태가 소유한다.

`object_table.zig`는 Header의 Handles가 지정한 최대 index에 예약 index 0을 더한 배열을 호출자 allocator로 생성한다. 모든 9종 object creation record의 명시적 handle을 점유시키며 0·stock·범위 밖 index를 거부한다. 명세는 CREATE 시 해당 element를 updated한다고 하며 기존 점유에 대한 실패를 규정하지 않으므로 같은 index의 새 CREATE는 slot을 교체하고 live 수를 늘리지 않는다. 정확히 12바이트인 [DELETEOBJECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/6f0f12a3-111a-478b-8251-a9505168f9a9)는 살아 있는 non-stock object만 삭제하고 slot 재사용을 허용한다. Palette object는 현재 entry count를 함께 보존하여 SELECT/SET/RESIZE의 생존·종류를 검사하고, SET의 `Start + NumberOfEntries`가 현재 크기를 넘지 않게 하며 RESIZE 후 크기를 갱신한다. `framing.validate`는 allocator를 필수로 받고 구조 검증 성공 후 이 상태 재생을 항상 수행하며 Summary에 create/delete/palette 동작·peak/final live 수를 제공한다.

현재 Object Table은 모든 creation의 handle 점유와 일반 DELETE, palette 조작을 완료했다. SELECTOBJECT의 stock 종류 및 객체 활성화, color-space 전용 SET/DELETE, 선택 객체를 삭제했을 때 기본 객체 복원은 해당 record payload와 playback state 후속 파트다. 이를 일반 Object Table 완료로 과장하지 않는다.

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

Point State Records에는 PointL 축 교환, SizeL 축 교환, 16바이트 크기 검사 제거, SETWINDOWEXTEX 분류 제거, framing 연결 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 공통 객체·기존 header·타입 집합·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드 전체 테스트와 Debug 통합 audit 8,905,815 checks를 통과했다.

Mode State Records에는 정확한 12바이트 크기 검사 제거, 미정의 MapMode 허용, 미정의 BinaryRasterOperation 허용, 미정의 StretchMode 거부, framing 연결 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 크기·strict enum·`MAY` 원값 보존·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,179/1,179 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,218/1,218 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.

Color State Records에는 정확한 12바이트 크기 검사 제거, 공통 ColorRef의 Red/Blue 교환, Reserved 허용 정책 사용, SETBKCOLOR 분류 제거, framing 연결 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 레코드 경계·공통 객체 의미·타입 집합·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,182/1,182 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,221/1,221 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.

Mapper Flags와 Miter Limit에는 Mapper 크기 제거·미정의 값 허용, Miter 크기 제거·endian 반전, Mapper framing 연결 제거, Miter framing 연결 제거의 6개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 18회 모두 각 전용 경계·원시 비트·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,187/1,187 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,226/1,226 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.

Text Alignment에는 정확한 12바이트 크기 제거, 미정의 비트 마스크 허용, low-axis 금지값 4 허용, high-axis 금지값 16 허용, framing 연결 제거의 5개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 크기·비트 영역·상호배타 조합·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,191/1,191 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,230/1,230 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.

Text Justification과 Scale Extents에는 justification 크기 제거·두 필드 교환, scaling 크기 제거·x numerator 0 허용·SCALEWINDOWEXTEX 분류 제거, 두 파서의 framing 연결을 각각 제거한 7개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 21회 모두 record 경계·signed wire 순서·0 금지·타입 집합·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,197/1,197 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,236/1,236 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.

DC Save/Restore에는 SAVEDC 크기 제거, RESTOREDC 크기 제거, SavedDC 음수 제약 제거, 존재하지 않는 stack depth 복원 허용, `-k`를 항상 한 단계만 pop, framing 연결 제거의 6개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 18회 모두 record 경계·값 범위·stack 전이·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,203/1,203 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,242/1,242 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.

Palette Wire Records에는 공통 LogPaletteEntry의 Blue/Red 교환, CREATE version 제거·빈 배열 허용, CREATE/SET 공유 count-size 검사 제거, SELECT의 0 handle 허용, RESIZE count 범위 제거, REALIZE 크기 제거, framing 연결 제거, stock handle 구분 제거의 9개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 27회 모두 공통 객체 의미·record 경계·값 범위·배열 산술·handle 종류·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,209/1,209 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,248/1,248 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.

Object Table과 Palette State에는 handle 범위 제거, 죽은 DELETE 허용, 다른 객체를 palette로 수용, SET의 현재 크기 검사 제거, RESIZE 상태 갱신 제거, DELETE 크기 제거, framing 연결 제거, creation 종류 누락의 8개 변이를 적용했다. Debug/ReleaseSafe/ReleaseFast의 24회 모두 table 경계·수명·종류·상태 전이·record 경계·타입 집합·통합 계약으로 탐지됐다. 모든 변이를 제거한 정상 구현은 세 모드에서 각각 1,213/1,213 테스트를 통과했다. Debug 통합 audit도 36/36 단계, 1,252/1,252 테스트, HWP5를 포함한 8,905,815 checks를 통과했다.
