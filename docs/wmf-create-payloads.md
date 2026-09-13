# WMF 펜·브러시·폰트 생성 payload

## 명세와 책임 분리

Microsoft [META_CREATEPENINDIRECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/bdb95c1f-c3e7-41cf-8b56-879c6f3441c3), [Pen Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/6e43c74e-2d19-4d40-97ab-b5933caa80ca)에 따라 `pen.zig`는 정확한 8 WORD record에서 style, signed PointS 폭 두 축과 ColorRef를 읽는다. style은 base 0~8, end-cap 0/0x100/0x200, join 0/0x1000/0x2000 조합만 허용하고 무시 대상인 y 좌표도 보존한다.

[META_CREATEBRUSHINDIRECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/8331e35d-0f97-4ec3-b3b0-cfb3281c0642), [LogBrush Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/e764d08b-dd0e-4040-ba31-7a557310c0d6)에 따라 `brush.zig`는 정확한 7 WORD record의 style, ColorRef, hatch 원값을 소유한다. style 0~9를 보존하고, hatched style에서만 명세 HatchStyle 0~5를 강제한다. 다른 style에서 SHOULD-ignore인 color와 hatch도 지우지 않는다.

[META_CREATEFONTINDIRECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/6040492f-7b58-49bd-bfef-ef1126bdffe3), [Font Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/dabb1ed6-e5e8-4243-80ed-e63443e5484f)에 따라 `font.zig`는 실제 28 WORD record의 50바이트 Font를 읽는다. 다섯 signed 값, 세 Boolean, charset, output/clip precision, quality, pitch/family와 32바이트 face 원문을 모두 보존한다. weight 0~1000, Boolean 0/1, 열거된 output precision과 quality, clip flag mask 및 face NUL 종단을 검사한다. face name은 Latin-1로 디코딩하거나 한글 인코딩으로 추정하지 않고 NUL 전 byte slice만 추가 view로 제공한다.

`color_ref.zig`는 RGB와 reserved 원값을 한 번만 읽는 SSOT다. `specified_zero`는 [ColorRef Object](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/0fdf54fc-6357-4cdd-b27f-795dee14cf86)의 reserved MUST 0을 적용하고, `observed_preserve`는 실제 한글 편차를 명시적으로 보존한다. 실패 후 자동 정책 전환은 없다. `create_payloads.zig`는 공용 record Iterator를 사용해 세 parser를 조립할 뿐 필드 해석을 복제하지 않는다.

## 실제 HWP 대조와 범위

hash-pinned WMF 표본에는 pen 128개, brush 43개, font 26개가 있으며 모두 각 명세 크기 8/7/28 WORD와 일치한다. ColorRef reserved가 0이 아닌 pen은 75개이고 모두 `0x02`라 strict 정책은 실제로 거부한다. 비어 있지 않은 face name은 25개, NUL 전 원문 합계는 234바이트다. `굴림`에 대응하는 표본 bytes `b1 bc b8 b2`도 문자열 변환 없이 보존한다.

실표본 감사는 세 종류 전체가 파싱되는지와 위 집계, strict 거부를 고정한다. 합성 감사는 signed pen 폭, ColorRef 채널/정책, brush hatch, font Boolean/NUL과 정확한 function/record 크기를 검사한다. charset과 face name 일치, 글꼴 대체, 객체 종류별 선택 적합성, bitmap/palette/region 생성 payload 및 실제 렌더링은 아직 완료로 세지 않는다.

적대적 검증은 (1) ColorRef strict reserved 검사 우회, (2) pen width x를 y 오프셋에서 읽기, (3) hatched brush 범위 검사 우회, (4) 첫 font Boolean을 검사 범위에서 제외, (5) NUL 없는 32바이트 face를 허용하는 다섯 변이를 주입했다. Debug·ReleaseSafe·ReleaseFast의 15회 모두 실제 표본 또는 공개 API 합성 감사가 검출했으며 각 변이는 원복했다.
