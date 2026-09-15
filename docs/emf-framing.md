# EMF header·record framing·EOF

## 명세와 책임

Microsoft [EMR_HEADER Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/de081cd7-351f-4cc2-830b-d03fb55e89ab)와 [Header Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e4a35c41-e8e3-43f9-bc07-a18e99bb866d)에 따라 EMF는 Type 1의 header record로 시작한다. 최소 크기는 Type/Size 8바이트와 Header object 80바이트를 합친 88바이트다. `header.zig`는 signature `0x464D4520`, Reserved 0, 전체 stream Bytes 일치를 검사하고 기본 Header object 필드를 보존한다. Version `0x00010000`은 MAY이므로 강제하지 않는다.

`records.zig`는 모든 EMF record의 Type/Size와 4바이트 정렬, 최소 8바이트, stream 경계를 소유한다. [RecordType Enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1eec80ba-799b-4784-a9ac-91597d590ae1)의 119개 값을 단일 enum으로 보존하고, 정의되지 않은 `0x45`, `0x6B`, `0x75` 및 범위 밖 값을 거부한다. payload 의미는 개별 record parser의 책임이다.

EOF의 선언/실제 Size, 마지막 SizeLast와 선택 palette의 정확한 계약은 [EMF EOF 팔레트](emf-eof-palette.md)가 소유한다.

`framing.zig`는 첫 record가 유일한 header이고 EOF가 유일한 마지막 record이며, 실제 record 수가 Header의 Records와 일치하는지 조립한다. record별 drawing/state 의미는 이 단계의 완료 범위가 아니다.

고정 clipping 레코드 네 종류의 구조·분류·집계는 [EMF 고정 clipping records](emf-fixed-clipping-records.md)가 단일 출처다.

RegionMode, RegionData와 나머지 두 clipping selection record의 구조·호환성 경계는 [EMF clipping selection](emf-clipping-selection.md)이 단일 출처다.

`path_bracket.zig`는 [Path Bracket Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b930b989-30ec-4954-a889-1dc60ce0b689)의 `BEGINPATH`, `ENDPATH`, `CLOSEFIGURE`, `FLATTENPATH`, `WIDENPATH`, `ABORTPATH`만 분류한다. 여섯 record는 8바이트 필수 prefix를 갖으며, 다른 Type을 이 집합으로 오인하지 않는다. State는 열린 construction에서 BEGINPATH를 거부하고, EOF 전에 END/ABORT로 닫혔는지 검사한다. `framing.zig`가 구조와 상태 검증을 전체 stream 순회에 연결한다. CLOSEFIGURE의 open-figure 권고와 실제 path drawing 의미는 별도 재생 계층의 책임이다.

`xform.zig`는 [XForm Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e84107e9-bc2b-4a14-9234-5d173adc1b59)의 M11, M12, M21, M22, Dx, Dy를 24바이트 wire 순서로 읽고 FLOAT 원시 비트를 보존한다. 문서에 finite 제약이 없으므로 NaN·Infinity를 임의 거부하지 않는다. `transform_records.zig`는 [SETWORLDTRANSFORM](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/985724c0-4db1-48f0-b346-67288b3288cb)의 32바이트와 [MODIFYWORLDTRANSFORM](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c70b85e5-8c31-418f-a7b8-349e417e0f76)의 36바이트 필수 prefix를 구분한다. 후자는 [ModifyWorldTransformMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e6bb2996-195f-473f-80c6-9dc1afe474f9)의 Identity/LeftMultiply/RightMultiply/Set 1~4만 허용한다. framing은 두 레코드의 구조 검증을 전체 stream에 연결하며 실제 행렬 합성은 재생 계층의 책임이다.

`geometry.zig`는 [MS-WMF PointL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/4eeaf09e-e41a-491c-93a1-7aec0afd4f96), [SizeL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/17b541c5-f8ee-4111-b1f2-012128f35871), [RectL](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/fe9329f4-7a87-4025-9a8a-541ee21e6530)의 signed 32비트 wire 해석을 단독 소유한다. 기존 EMF header도 이 SSOT를 재사용한다. `point_records.zig`는 SETWINDOWEXTEX/ORGEX, SETVIEWPORTEXTEX/ORGEX, SETBRUSHORGEX, MOVETOEX의 16바이트 필수 prefix와 PointL/SizeL 의미를 구분하고 framing에 연결한다. LINETO처럼 배치가 같아도 이 State Record 집합이 아닌 타입은 claim하지 않는다.

`mode_records.zig`는 12바이트 필수 prefix를 가진 [SETMAPMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/aa4ad35d-fa42-4a4f-959a-8b41304e1b05), [SETBKMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/7c584a42-b6dd-47b8-a0b6-f529133292f4), [SETPOLYFILLMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e8799c80-fe74-45c1-bf6d-3eb78edd4ed2), [SETROP2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/cedee7e0-4e66-47b6-ae1d-816e1e319786), [SETSTRETCHBLTMODE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/ff00ab98-6e2c-4eca-b664-04ab2956b6a5), [SETARCDIRECTION](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/83a955e6-13b8-4720-a521-542e3dd91cba)을 소유한다. MapMode·BackgroundMode·PolygonFillMode·BinaryRasterOperation·ArcDirection은 각 공식 enum 밖의 값을 거부한다. StretchMode는 레코드 명세가 enum 값일 수 있다고 `MAY`로 규정하므로 u32 원값을 항상 보존하고, 알려진 1~4만 optional enum으로 함께 제공한다. framing은 여섯 레코드를 전체 stream 검사에 연결하며 그래픽 상태 적용과 raster 연산은 재생 계층의 책임이다.

`color_records.zig`는 12바이트 필수 prefix를 가진 [SETTEXTCOLOR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/1ae5c616-cf8e-4f5d-a7c3-bfc1f70ece28)와 [SETBKCOLOR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/24f40952-62d4-40b0-ba40-aad8fb4fc421)을 구분한다. 색상 객체는 새로 복제하지 않고 기존 WMF `color_ref.zig`를 SSOT로 재사용한다. [ColorRef](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/0fdf54fc-6357-4cdd-b27f-795dee14cf86)의 Red/Green/Blue wire 순서와 Reserved `MUST be 0x00`을 적용하고 raw u32도 보존한다. framing은 두 레코드를 전체 stream 검사에 연결하며 색상 상태 적용은 재생 계층의 책임이다.

`mapper_flags.zig`는 12바이트 필수 prefix를 가진 [SETMAPPERFLAGS](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/6647abf7-bd70-43ef-8766-1a6e06ed2f03)의 두 정의값을 구분한다. 값 0은 font mapper를 장치 종횡비와 무관하게 두고, 값 1은 장치 종횡비와 일치하는 font 선택을 지시한다. 그 밖의 값은 정의되지 않았으므로 거부한다. `miter_limit.zig`는 12바이트 필수 prefix를 가진 [SETMITERLIMIT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2637d0d0-92dd-48e8-be5e-6400b4d1fc5e)의 원시 DWORD를 보존한다. 본문은 UINT32로 정의하지만 제품 동작 주석은 Windows GDI가 FLOAT도 받는다고 명시하므로, 같은 raw 비트의 unsigned/float view를 모두 제공하고 NaN·Infinity를 정규화하거나 거부하지 않는다. 두 파서는 상태 적용 없이 framing 검증만 담당한다.

`text_alignment.zig`는 12바이트 필수 prefix를 가진 [SETTEXTALIGN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/a49bb565-a583-41da-8d4a-8a0314b3e397)의 DWORD mask를 보존한다. [TextAlignmentMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/2cf0d802-5db7-42f6-bb75-50ff195a6c7c)의 UPDATECP와 RTL, 두 축 그룹 `0/2/6`과 `0/8/24`만 허용하고 `4`, `16`, 미정의 비트를 거부한다. 같은 숫자는 현재 글꼴의 baseline에 따라 [VerticalTextAlignmentMode](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/2475d008-f5ff-4c93-b28b-3953818b8827)로 다르게 해석된다. 이 레코드만으로 baseline을 알 수 없으므로 파서는 축 그룹을 중립적으로 보존하며, 수평/수직 의미 선택은 글꼴 상태를 가진 재생 계층의 책임이다.

`text_justification.zig`는 16바이트 필수 prefix를 가진 [SETTEXTJUSTIFICATION](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/edbc2be0-1da0-45d6-9c05-677cbcaa2d47)의 nBreakExtra와 nBreakCount를 signed i32 wire 순서로 보존한다. 명세에 별도 값 범위가 없으므로 음수와 극값을 임의 보정하지 않는다. `scale_extents.zig`는 같은 24바이트 필수 prefix를 가진 [SCALEVIEWPORTEXTEX](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/469e353c-4209-4919-a5aa-9331b60765ed)와 [SCALEWINDOWEXTEX](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/01698f29-bbcb-4100-9bad-0fd52c33b0da)를 구분한다. x/y numerator와 denominator 네 필드는 모두 signed i32이고 모두 0을 금지한다. 실제 곱셈·나눗셈과 fixed-scale mapping mode에서의 적용 여부는 overflow 및 상태 정책이 필요한 재생 계층의 책임이다.

`dc_stack.zig`는 매개변수가 없는 8바이트 필수 prefix의 [SAVEDC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/8f8a4df2-f8d7-4d39-afc0-94e19f524652)와 12바이트 필수 prefix의 [RESTOREDC](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/efa2f180-4c7e-4a7b-b4ef-a1d06a0ce89f)를 구분한다. SavedDC는 반드시 음수이며 `-k`는 현재 stack의 k번째 저장 상태를 복원하면서 그 상태와 더 최신 상태를 제거한다. framing은 저장 depth를 추적하여 존재하지 않는 상태 복원을 거부한다. EOF에서 남은 저장 상태를 모두 복원해야 한다는 명세는 없으므로 stack이 비어야 한다는 제약은 추가하지 않는다. 실제 그래픽 속성 snapshot은 재생 계층의 책임이다.

`log_palette_entry.zig`는 [LogPaletteEntry](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/c1f7b285-be16-4112-a4e6-0b2fd4c1d148)의 Reserved/Blue/Green/Red 순서를 단독 소유하며 EOF palette와 `palette_records.zig`가 이를 공유한다. Reserved는 MUST-ignore이므로 값을 보존한다. `palette_records.zig`는 CREATEPALETTE, SELECTPALETTE, SETPALETTEENTRIES, RESIZEPALETTE, REALIZEPALETTE를 구분한다. 각 필수 prefix와 CREATE/SET의 count-derived entry 끝을 요구하고 그 뒤 data는 의미 배열에서 제외한다. 상세 경계와 검증은 [핸들·팔레트 record 호환성](emf-handle-record-compatibility.md)이 단일 출처다.

`palette_records.zig`는 각 레코드의 wire 계약만 소유한다. handle이 Header Handles 범위에 있는지, CREATE가 빈 slot을 쓰는지, SELECT/SET/RESIZE가 살아 있는 LogPalette를 가리키는지, Start+count가 현재 palette 크기를 넘는지는 아래 [EMF Object Table](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/e4fa4e63-9096-4cdc-b776-85e2a1e4e1f4) 상태가 소유한다.

`object_table.zig`는 Header의 Handles가 지정한 최대 index에 예약 index 0을 더한 배열을 호출자 allocator로 생성한다. 모든 9종 object creation record의 명시적 handle을 점유시키며 0·stock·범위 밖 index를 거부한다. 명세는 CREATE 시 해당 element를 updated한다고 하며 기존 점유에 대한 실패를 규정하지 않으므로 같은 index의 새 CREATE는 slot을 교체하고 live 수를 늘리지 않는다. 12바이트 필수 prefix의 [DELETEOBJECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/6f0f12a3-111a-478b-8251-a9505168f9a9)는 살아 있는 non-stock object만 삭제하고 slot 재사용을 허용한다. Palette object는 현재 entry count를 함께 보존하여 SELECT/SET/RESIZE의 생존·종류를 검사하고, SET의 `Start + NumberOfEntries`가 현재 크기를 넘지 않게 하며 RESIZE 후 크기를 갱신한다. `framing.validate`는 allocator를 필수로 받고 구조 검증 성공 후 이 상태 재생을 항상 수행하며 Summary에 create/delete/palette 동작·peak/final live 수를 제공한다.

`basic_object_creation.zig`는 [CREATEPEN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2374647f-df67-48e3-86aa-384715c28e71)의 28바이트와 [CREATEBRUSHINDIRECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b9a8ef5d-0089-4e42-b317-e6ebc0ff098f)의 24바이트 필수 prefix를 소유한다. `pen_style.zig`는 [PenStyle](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/b2e62915-8401-429f-bb6d-b2506a4c2fe8)의 line/type/cap/join 비트와 예약 비트를 검사하고 PS_ALTERNATE가 cosmetic에만 적용되는 제약을 적용한다. `log_pen.zig`는 [LogPen](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/93ce3f45-37ac-4aff-b6e8-2f6db054c4c4)의 signed PointL을 공통 geometry parser로 읽으며 무시 대상 y도 보존하고 cosmetic x 폭 1을 요구한다. ColorRef는 WMF와 공유하는 단일 parser의 specified-zero 정책을 사용한다.

`log_brush_ex.zig`는 [LogBrushEx](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/6d790f8d-5165-4746-bac3-3443915c2071)의 세 지원 style만 허용한다. SOLID/HATCHED에서 ColorRef를 검사하고 HATCHED에서만 0..5 HatchStyle을 해석한다. NULL의 color와 SOLID/NULL의 hatch는 명세상 무시 대상이므로 임의 값도 원문 정수로 보존하고 의미 검증하지 않는다. Object Table은 전체 payload 검증 성공 후에만 handle을 생성·교체하므로 실패한 record가 기존 상태를 오염시키지 않는다.

`brush_style.zig`, `hatch_style.zig`, `color_usage.zig`는 EMF 객체들이 공유하는 값 영역을 단독 소유한다. `log_pen_ex.zig`는 [LogPenEx](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/5b67b3ee-ea00-4f80-9b73-2959804381be)의 24바이트 고정부와 checked `NumStyleEntries * 4` 배열을 읽고 소비 끝을 반환한다. cosmetic 폭 1, NULL brush와 PS_NULL의 관계, geometric pen의 brush 제한, brush별 ColorRef/ColorUsage 및 geometric/cosmetic hatch 영역을 구분한다. 명세가 non-user style의 entry count를 0으로 SHOULD 지정하므로 0이 아닌 값을 손상으로 단정하지 않으며 배열 원문을 보존한다.

가변 LogPenEx, 선택 DIB와 후행 extra data의 정확한 계약은 [EMF 확장 펜](emf-extended-pen.md)이 소유한다.

비트맵 브러시의 정확한 offset/size slice, 정렬 padding과 후행 extra data 계약은 [EMF 비트맵 브러시](emf-bitmap-brush.md)가 소유한다.

`EMR_EXTCREATEFONTINDIRECTW`의 가변 글꼴 객체 계약과 검증 기록은 [EMF 글꼴 생성](emf-font-creation.md)이 소유한다.

32비트 `POLYBEZIER`·`POLYGON`·`POLYLINE` 계열과 `POLYPOLYLINE`·`POLYPOLYGON`의 배열 계약은 [EMF 32비트 poly drawing](emf-poly-records.md)이 소유한다.

동일 도형의 16비트 PointS 변형은 [EMF 16비트 poly drawing](emf-poly-records-16.md)이 소유하며 종류·산식·그룹 규칙은 32비트 파트와 공유한다.

병렬 점/type 배열을 가진 `POLYDRAW`·`POLYDRAW16`은 [EMF PolyDraw](emf-poly-draw.md)가 소유한다.

단일 PointL 기반 `LINETO`·`SETPIXELV`는 [EMF 기본 점 drawing](emf-basic-point-drawing.md)이 소유한다.

고정 길이 `ANGLEARC`와 사각형·호 계열은 [EMF 기본 도형](emf-basic-shapes.md)이 소유한다.

`기본 점`·`기본 도형`과 고정 상태·변환·path record의 상위 크기 계약은 [EMF 고정 prefix 호환성](emf-fixed-prefix-compatibility.md)이 소유한다. 가변 배열·offset payload의 의미 끝과 extra data는 각 전용 문서에서 감사한다.

[MS-WMF Compression](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/4e588f70-bd92-4a6f-b77f-35d0feaf7a57)의 BI_CMYK, BI_CMYKRLE8, BI_CMYKRLE4도 공통 BMP header enum에서 보존한다. [DeviceIndependentBitmap](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/7376542a-cce9-4625-8ead-585e9538f9f1)의 규칙대로 RGB/BITFIELDS/CMYK는 stride-derived 길이를, 나머지 압축은 ImageSize를 사용한다. 이 단계는 DIB 구조와 원문 payload 보존까지이며 JPEG/PNG/RLE/CMYK 픽셀 해제, V5 profile 의미, 실제 brush 재생은 완료 범위가 아니다. 공용 BMP RGBA decoder도 CMYK를 RGB로 오해하지 않고 명시적으로 거부한다.

Bitmap Brush 적대적 검증은 (1) DIBColors를 항상 RGB로 취급, (2) MONOBRUSH의 1bpp 정책 제거, (3) palette 최소 길이 계산 제거, (4) pixel buffer 1바이트 부족 허용, (5) payload 검증 전에 object slot 변경의 다섯 변이를 각각 주입했다. 전체 네이티브 테스트가 값 영역, mono 정책, DIB 경계, 정확 길이, 실패 원자성 위반을 모두 실제 실패로 검출했으며 각 변이는 즉시 원복했다. 공식 Compression enum 재대조에서 기존 공용 BMP header가 세 CMYK 값을 누락한 사실도 발견해 구조 지원과 오해 없는 decode 거부를 추가했다.

최종 원복 상태의 Debug·ReleaseSafe·ReleaseFast audit는 각각 40/40 단계와 전체 1,306/1,306 테스트(네이티브 1,267개), HWP 검사 8,905,827건을 통과했다. 첫 Debug audit에서 독립 JS BMP oracle이 값 11을 미지원으로 고정한 과거 계약을 검출했고, 공식 enum에 맞춰 CMYK 세 값 수용·미정의 인접값 거부·RGBA decode 거부를 독립적으로 검사하도록 수정한 뒤 세 모드를 모두 처음부터 재실행했다. 실제 HWP corpus 584개에는 EMF가 0개이므로 bitmap brush 실생성기 호환성 근거로 확대 해석하지 않는다.

이 파트의 적대적 검증은 (1) record 선언 크기 검사를 제거, (2) cosmetic 폭 기준을 1에서 0으로 변경, (3) brush style 3을 허용, (4) HATCHED의 hatch 상한을 제거, (5) 무시 대상인 SOLID hatch도 검증, (6) payload 검증 전에 pen handle을 생성하는 여섯 변이를 각각 주입했다. 전체 네이티브 테스트가 모든 변이를 실패로 검출한 뒤 원복했다. 이 과정에서 기존 framing 및 HWP 삽입 fixture의 cosmetic 폭이 0이던 실제 오류를 발견해 1로 고쳤고, 선언 크기와 실제 slice 길이의 독립 검사 및 실패 시 object-table 무변경 검사를 추가했다.

최종 원복 상태에서 Debug·ReleaseSafe·ReleaseFast audit를 순차 실행해 각 40/40 단계, 전체 1,285/1,285 테스트와 HWP 검사 8,905,815건이 통과했다. 실제 HWP fixture의 compressed BinData를 교체하는 합성 EMF 경로는 세 모드 모두 13개 record, creation 3개와 올바른 object 수명을 보고했다. 별도 실제 corpus 584개에는 EMF BinData가 0개이므로 실제 생성기 다양성에 대한 호환성 주장은 하지 않는다.

`stock_object.zig`는 [StockObject](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/d6dffd25-8615-42f8-aed1-309f1fe54ab2)의 비연속 19개 값과 brush/pen/font/palette 종류를 단독 소유한다. 예약 gap `0x80000009`, 범위 밖 stock 값과 일반 handle을 stock으로 수용하지 않는다. [SELECTOBJECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/145b063d-5f96-41fe-b7ae-1e615b2bc2bf)는 12바이트 필수 prefix를 가지며 0이 아닌 살아 있는 명시적 brush/pen/font 또는 종류가 맞는 stock object만 활성화한다. Palette는 기존 SELECTPALETTE, color space는 후속 SETCOLORSPACE의 전용 경계를 유지하므로 SELECTOBJECT로 수용하지 않는다.

Object Table은 brush/pen/font/palette의 현재 명시적 선택을 별도로 추적한다. 같은 종류를 새로 선택하면 이전 객체는 삭제하지 않고 비활성화되며, 선택된 객체를 DELETEOBJECT로 삭제하면 해당 종류의 기본 stock 상태(null)로 복원한다. SELECTPALETTE도 같은 DC 선택 상태에 연결했다. SAVEDC에서 네 선택값을 저장하고 RESTOREDC의 음수 상대 깊이로 복원하며, 삭제된 handle은 살아 있는 모든 저장 snapshot에서도 제거해 이후 복원으로 부활하지 않게 한다. 같은 handle을 같은 종류 creation으로 갱신하면 활성 인덱스를 유지하고, 다른 종류로 교체하면 모순되는 현재/snapshot 선택을 해제한다. Snapshot 저장소는 전체 record 수가 아니라 실제 SAVEDC 수만큼만 할당한다.

`color_space_records.zig`는 12바이트 필수 prefix의 [SETCOLORSPACE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/2a84d7a5-f8c1-4dd2-ae79-a029a25ad601)와 [DELETECOLORSPACE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/5d137387-d79a-4bc8-9a4d-38291320e148)의 handle wire 형식을 분리한다. Object Table은 살아 있는 color-space 종류만 SET으로 선택하고 DC snapshot에 함께 저장한다. 전용 DELETE와 일반 DELETEOBJECT 모두 같은 삭제 경계를 사용하며 현재 선택을 삭제하면 기본 color-space 상태(null)로 복원하고 저장 snapshot에서도 제거한다. Microsoft 구현이 일반 DELETEOBJECT를 사용하고 명세도 이를 권고하므로 color-space라는 이유로 일반 삭제를 거부하지 않는다.

`color_space_values.zig`는 [LogicalColorSpace](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/eb4bbd50-b3ce-4917-895c-be31f214797f)의 세 값과 [GamutMappingIntent](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/9fec0834-607d-427d-abd5-ab240fb0db38)의 네 값을 단독 소유한다. BitmapV5 전용 LINK/MBED 값을 이 객체 enum에 섞지 않는다. `log_color_space.zig`는 공통 68바이트 코어, [LogColorSpace](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/0a8def2e-0d65-4174-9f67-17c8f3341514)의 고정 260바이트 ANSI filename 저장소와 [LogColorSpaceW](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/87794877-4d83-40fa-98cb-9ffa20eed863)의 고정 520바이트 UTF-16LE 저장소를 분리한다. Signature `0x50534F43`, Version `0x400`, 내부 Size 328/588와 enum을 검사한다. XYZ 2.30 words와 gamma 원값, filename 전체 저장소는 보존한다. Gamma의 8.8 설명과 문서 예시가 비트 수준에서 일치하지 않고 별도 MUST 마스크가 없으므로 구조 계층에서 임의 정규화·거부하지 않는다. ANSI는 첫 NUL 전 ASCII를, W는 필수 NUL 전 UTF-16 scalar를 검사하며 종료 뒤 고정 저장소는 해석하지 않는다.

`color_space_creation.zig`는 CREATECOLORSPACE의 340바이트와 CREATECOLORSPACEW의 608바이트 필수 prefix, checked `cbData` extent와 최대 3바이트 alignment padding을 검증한다. 의미 payload 뒤 extra data는 무시하며 객체·profile·padding view에 포함하지 않는다. Object Table은 두 파서가 성공한 뒤에만 handle을 점유한다. 상세 record 경계와 검증은 [color-space 생성 record 호환성](emf-color-space-record-compatibility.md)이 단일 출처다. 내장 profile data의 ICC 의미, 선택 color-space를 사용하는 drawing playback과 렌더링은 후속 파트이므로 전체 EMF 재생 완료가 아니다.

## 실제 HWP BinData 검증

`tests/hwp5/emf-corpus-evidence.mjs`가 HWP CFB의 FileHeader와 DocInfo `HWPTAG_BIN_DATA`를 읽어 정확한 `/BinData/BINxxxx.ext` stream을 선택하고, 문서 기본값과 항목별 compression 정책에 따라 해제한다. 확장자 `emf`뿐 아니라 offset 40의 EMF signature도 독립적으로 확인하므로 잘못된 확장자의 실제 EMF를 놓치지 않으며, `emf`로 선언됐지만 signature가 다른 값은 별도 실패 증거로 남긴다. 해제된 bytes는 test-only WASM mode 337을 통해 제품 `framing.validate`에 전달하고 summary와 record type 순서를 반환한다.

현재 저장소의 실제 표본 584개를 전수 조사한 최초 baseline은 지원 가능한 HWP 475개와 BinData 2,167개 중 EMF 0개였다. 따라서 이 수치는 실제 EMF 호환성 증거가 아니라 표본 공백을 드러내는 값이다. 종단간 계약은 기존 실제 HWP CFB fixture의 compressed BinData 한 항목에 object/palette EMF를 주입해 CFB → DocInfo 선택 → inflate → signature → Zig framing/object-table 경계를 검증한다. 외부에서 유래한 실제 EMF 포함 HWP가 확보되면 같은 survey에 자동 편입되며 record type coverage가 보고된다.

Header base와 Extension1/2 판별, description, PixelFormatDescriptor의 현재 계약과 검증 기록은 [EMF Header 가변 payload](emf-header-payload.md)가 단일 출처다.

## 적대적 검증

아래의 과거 기록 중 “정확 크기” 제거를 변이로 본 결과는 당시 계약에 대한 실행 이력이다. 현재 고정 record 호환성 계약과 완료 근거는 [EMF 고정 prefix 호환성](emf-fixed-prefix-compatibility.md)을 따르며, 과거 결과를 현재 정확 길이 제약의 근거로 사용하지 않는다.

Object selection 추가분은 다섯 차례 경계 검토로 palette 선택도 DC 상태라는 점, color-space 조작은 별도 검토가 필요하다는 점, 같은 handle·같은 종류 교체 시 활성 선택을 유지해야 한다는 점, 다른 종류 교체 시 현재 상태와 저장 snapshot을 함께 비활성화해야 한다는 점, record 수 기반 snapshot 선할당이 입력 증폭을 허용한다는 점을 찾아 수정했다. StockObject는 문서의 비연속 19개 값을 독립 배열로 전부 고정하여 예약 gap과 양끝 인접값을 거부한다. 명시적/stock 선택, 잘못된 종류·죽은 handle·범위 밖 handle, 선택 객체 삭제 후 기본 복원, palette 선택, SAVEDC/RESTOREDC, 삭제 뒤 snapshot 비부활, 같은/다른 종류 교체를 단위 및 전체 stream 테스트로 검증한다. 수정 후 Debug·ReleaseSafe·ReleaseFast의 전체 audit은 각각 40/40 단계와 1,256/1,256 테스트, HWP5 8,905,815 checks를 통과했다. 실제 584개 HWP corpus에는 EMF가 0개이므로 실파일 EMF 호환성 완료 근거로 확대 해석하지 않는다.

Color-space 조작 추가분은 다섯 차례 적대적 대조에서 일반 DELETEOBJECT 거부가 명세와 반대인 결함을 먼저 재현해 제거했다. 이후 전용 DELETE의 종류 검사, 죽은·0·stock·범위 밖 handle, 실패 시 통계 불변성, 비활성 color-space 삭제 시 현재 선택 보존, 현재/저장 DC의 삭제 후 기본 복원, 다른 종류로 같은 handle 교체 시 snapshot 비활성화를 직접 검사한다. HWP CFB의 압축 BinData에 합성 SETCOLORSPACE/DELETECOLORSPACE를 통과시켜 테스트용 WASM의 두 nonzero 보고 필드와 record type을 독립 JS decoder에서 확인한다. 당시 합성 CREATECOLORSPACE는 handle 점유만 검사했으나 아래 생성 payload 작업에서 유효한 전체 객체로 교체했다. 당시 고정 소스의 Debug·ReleaseSafe·ReleaseFast 전체 audit은 각각 40/40 단계와 1,266/1,266 테스트(네이티브 1,227개), HWP5 8,905,815 checks를 통과했다.

Color-space 생성 payload 추가분은 다섯 차례 재검토에서 기존 12바이트 가짜 생성 fixture 7건을 새 strict 파서가 실제 거부하는 것을 확인해 340/608바이트 fixture로 교체했다. 테스트 전용 생성 함수가 제품 공개 모듈에 노출된 문제와 W data 정렬의 32비트 `usize` 끝 오버플로 가능성을 제거했다. 처음에는 “optional filename”을 필드 생략으로 해석했으나 공식 wire 표가 260/520바이트 필드를 고정한 사실과 다시 대조해 68바이트 축약 허용을 철회했다. Gamma 외곽 bit 거부도 상충하는 공식 예시보다 강한 제약이라 제거했다. 세 enum 값·네 intent 값과 인접/BitmapV5 전용 값, signature/version/내부 Size, ANSI 128개 비ASCII 값, W surrogate·마지막 종단, 두 record의 모든 prefix 절단, 임의 중간 Size, 최대 cbData, profile/padding 보존을 직접 검사한다. HWP BinData 합성 입력도 유효한 328바이트 LogColorSpace를 포함하도록 교체했으며 실제 corpus의 EMF 0개 한계는 변하지 않는다. 고정된 최종 소스의 Debug·ReleaseSafe·ReleaseFast 전체 audit은 각각 40/40 단계와 1,277/1,277 테스트(네이티브 1,238개), HWP5 8,905,815 checks를 통과했다.

signature, Header Bytes, Header Records, EOF SizeLast, terminal EOF 뒤 데이터 검사를 하나씩 제거했다. Debug/ReleaseSafe/ReleaseFast의 15회 모두 각각 손상된 필드 또는 trailing data가 있는 stream을 실제 성공값으로 반환해 테스트가 탐지했다. 변이는 모두 제거하고 정상 구현을 별도로 검증한다.

절단 테스트는 오류 우선순위도 분리한다. 원래 Bytes 108을 유지한 88바이트 slice는 MissingEmfEof보다 먼저 InvalidEmfDeclaredBytes가 맞으므로, header-only와 두 번째 record 절단 fixture는 Header Bytes를 해당 slice 길이로 맞춘 뒤 각각 EOF 부재와 record 절단만 검증한다.

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
