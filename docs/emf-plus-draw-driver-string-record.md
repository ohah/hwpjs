# EMF+ DrawDriverString record

## 범위와 단일 출처

`emf_plus_draw_driver_string.zig`는 MS-EMFPLUS 2.3.4.6의 Type, Flags, BrushId, DriverStringOptionsFlags, MatrixPresent, GlyphCount, Glyphs, GlyphPos와 선택 TransformMatrix를 조립합니다. Flags의 하위 ObjectID는 Font 슬롯이며 S `0x8000`이 켜지면 BrushId DWORD를 literal ARGB로, 꺼지면 0~63 Brush 슬롯으로 해석합니다. 이 선택은 `emf_plus_brush_id.zig`, S/ObjectID 비트는 `emf_plus_record_flags.zig`, ARGB·PointF·TransformMatrix wire 값은 기존 공통 모듈이 소유합니다.

DriverStringOptionsFlags는 CmapLookup, Vertical, RealizedAdvance, LimitSubpixel 네 비트만 허용합니다. MatrixPresent는 명세의 BOOLEAN 값 0 또는 1만 허용하고 임의의 nonzero를 true로 보정하지 않습니다. Glyph는 UTF-16 문자열로 해석하지 않는 u16 glyph index 배열이므로 고립 surrogate를 포함한 모든 원값을 보존합니다. PointF와 행렬도 명세에 별도 유한성 제약이 없어 IEEE 754 원비트를 유지합니다.

## 배열 배치와 크기 정책

data의 의미 순서는 16바이트 prefix, `GlyphCount * 2` Glyphs, `GlyphCount * 8` GlyphPos, 선택적인 24바이트 TransformMatrix입니다. 홀수 GlyphCount에서는 GlyphPos가 2바이트 경계에서 시작하며 Glyphs와 GlyphPos 사이에 내부 패딩을 넣지 않습니다. 의미 데이터 뒤에만 전체 record의 DWORD 정렬을 위한 0 또는 2바이트를 허용하고 그 바이트 값은 손실 없이 빌립니다. Size, DataSize와 실제 slice 세 축 및 모든 곱셈·덧셈을 독립적으로 검사합니다. 기본 glyph 한도는 16 Mi개입니다.

공식 표의 Size/DataSize 설명은 DWORD 정렬을 요구하지만 가변부 공식은 홀수 Count에서 정렬되지 않으며, Glyphs 설명에는 그 사이 패딩이 정의되어 있지 않습니다. LibreOffice의 EMF+ reader는 Count개의 u16 직후 Count개의 PointF를 읽고, Wine GDI+의 writer/playback도 같은 연속 배치를 사용하면서 record 끝만 DWORD 정렬합니다. 따라서 내부 패딩을 추정하는 호환 분기는 두지 않고 이 연속 배치를 명시적 정책으로 채택했습니다. 확인한 Wine 소스 revision은 `7b3fff76fa5178f6ce0141b2c776afa2a822f101`입니다.

RealizedAdvance 설명은 첫 위치만 advance로 의미 있다고 하지만 구조 공식과 배열 설명은 Count개의 PointF를 요구합니다. parser는 항상 Count개를 보존하고 렌더러만 해당 flag의 재생 의미를 적용해야 합니다. 명세 각주대로 Windows 구현이 이 flag를 기록하지 않는다는 사실은 wire 입력을 거부할 근거가 아닙니다. GlyphCount 0도 명시적인 최소값 MUST가 없고 최소 record 크기와 모순되지 않으므로 허용합니다.

## Object Table 연결과 미지원 경계

stream은 Font ObjectID 슬롯이 존재하고 ObjectTypeFont인지 항상 확인합니다. S가 꺼진 경우에만 BrushId 슬롯의 존재와 ObjectTypeBrush를 확인하며 literal ARGB에서는 같은 숫자의 슬롯 상태를 참조하지 않습니다. payload·참조·한도·집계 오류는 comment 전체 상태를 원복하고 상위 EMF framing도 같은 stream 경로를 사용합니다.

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawDriverString 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, borrowed glyph/position iteration, 조건부 객체 참조와 stream/framing 연결입니다. glyph shaping, CMap 조회, vertical/advance/subpixel 재생, 변환 적용, 래스터화와 저장은 미구현입니다.

## 검증 기록

합성 fixture는 Font/Brush ID 0~63, literal ARGB, 네 option, MatrixPresent 0/1, 홀수·짝수·0 glyph, 고립 surrogate glyph, 비유한 PointF, 비정렬 PointF·행렬 시작, 후행 padding, 모든 prefix 잘림, 독립 Size/DataSize/slice 불일치, glyph 한도와 Font/Brush 존재·타입·조건부 조회, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

S mask와 Brush ID 63 경계·선택, option 정의 비트·예약 비트, MatrixPresent exact boolean, glyph 한도, glyph/position/matrix 폭, record 끝 정렬, 반환 Font/options/matrix/count/transform, stream routing·Font/Brush 타입·집계 대상을 각각 망가뜨린 20개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리해 Debug·ReleaseSafe·ReleaseFast 총 60/60회를 모두 검출했고 생존·컴파일 실패·무변경 치환은 없습니다. 유효 로그는 `/tmp/hwpjs-emfplus-driver-string-mutants.GuNsF8`입니다.

최초 캠페인은 Brush ID 63 변이가 DriverString 통합 필터에서 생존해 전체 결과를 폐기했습니다. 공통 BrushIdOrColor 단위 테스트가 별도 필터에 있었던 실행 범위 편향이므로 같은 변이 복사본에서 두 필터를 모두 실행하도록 수정한 뒤 처음부터 재실행했으며, 위 수치는 두 번째 캠페인만 포함합니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,667/1,667 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-driver-string-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
